//! Reference RT lane for Levels 1–2.

use super::hotswap_engine_api::{EngineHandle, EnginePool};
use super::hotswap_lane_level12::Ticket;
use super::hotswap_lane_shared::LaneShared;
use super::sync::Arc;

#[derive(Debug, Clone, Copy)]
enum RtState {
    Steady { current: EngineHandle },
    Prewarm {
        from: EngineHandle,
        to: EngineHandle,
        prewarm_left_blocks: u32,
        fade_frames: u32,
    },
    Crossfade {
        from: EngineHandle,
        to: EngineHandle,
        fade_frames: u32,
        fade_cursor: u32,
    },
}

/// RT lane instance.
///
/// `block_len` must match the slice length passed to `process_block`.
pub struct RtLane {
    shared: Arc<LaneShared<EngineHandle>>,
    state: RtState,
    scratch_a: Vec<f32>,
    scratch_b: Vec<f32>,
    block_len: usize,
}

impl RtLane {
    pub fn new(shared: Arc<LaneShared<EngineHandle>>, initial: EngineHandle, block_len: usize) -> Self {
        Self {
            shared,
            state: RtState::Steady { current: initial },
            scratch_a: vec![0.0; block_len],
            scratch_b: vec![0.0; block_len],
            block_len,
        }
    }

    pub fn shared(&self) -> Arc<LaneShared<EngineHandle>> {
        self.shared.clone()
    }

    pub fn current_handle(&self) -> EngineHandle {
        match self.state {
            RtState::Steady { current } => current,
            RtState::Prewarm { from, .. } => from,
            RtState::Crossfade { from, .. } => from,
        }
    }

    /// RT thread: process one audio block.
    ///
    /// Contract: `out.len() == block_len`.
    pub fn process_block<P: EnginePool>(&mut self, pool: &mut P, out: &mut [f32]) {
        debug_assert_eq!(out.len(), self.block_len);

        // Opportunistically take a new ticket only when we're not already
        // running prewarm/crossfade.
        if let RtState::Steady { current } = self.state {
            if let Some(t) = self.shared.rt_try_take() {
                self.begin_ticket(current, t);
            }
        }

        match self.state {
            RtState::Steady { current } => {
                pool.engine_mut(current).render(out);
            }

            RtState::Prewarm {
                from,
                to,
                mut prewarm_left_blocks,
                fade_frames,
            } => {
                // Render audible output from `from`.
                pool.engine_mut(from).render(out);

                // Render `to` into scratch and drop it (warm caches/state).
                pool.engine_mut(to).render(&mut self.scratch_b);

                if prewarm_left_blocks > 0 {
                    prewarm_left_blocks -= 1;
                }

                if prewarm_left_blocks == 0 {
                    self.state = RtState::Crossfade {
                        from,
                        to,
                        fade_frames: fade_frames.max(1),
                        fade_cursor: 0,
                    };
                } else {
                    self.state = RtState::Prewarm {
                        from,
                        to,
                        prewarm_left_blocks,
                        fade_frames,
                    };
                }
            }

            RtState::Crossfade {
                from,
                to,
                fade_frames,
                mut fade_cursor,
            } => {
                pool.engine_mut(from).render(&mut self.scratch_a);
                pool.engine_mut(to).render(&mut self.scratch_b);

                let fade_frames = fade_frames.max(1);
                let len = out.len() as u32;

                for i in 0..out.len() {
                    let p = fade_cursor.saturating_add(i as u32);
                    let t = (p as f32 / fade_frames as f32).min(1.0);
                    out[i] = self.scratch_a[i] * (1.0 - t) + self.scratch_b[i] * t;
                }

                fade_cursor = fade_cursor.saturating_add(len);

                if fade_cursor >= fade_frames {
                    self.shared.rt_publish_retired(from);
                    self.shared.rt_mark_idle();
                    self.state = RtState::Steady { current: to };
                } else {
                    self.state = RtState::Crossfade {
                        from,
                        to,
                        fade_frames,
                        fade_cursor,
                    };
                }
            }
        }
    }

    fn begin_ticket(&mut self, current: EngineHandle, t: Ticket<EngineHandle>) {
        let to = t.target;

        if t.prewarm_blocks > 0 {
            self.state = RtState::Prewarm {
                from: current,
                to,
                prewarm_left_blocks: t.prewarm_blocks,
                fade_frames: t.fade_frames.max(1),
            };
        } else {
            self.state = RtState::Crossfade {
                from: current,
                to,
                fade_frames: t.fade_frames.max(1),
                fade_cursor: 0,
            };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct ConstEngine(f32);
    impl super::super::hotswap_engine_api::Engine for ConstEngine {
        fn render(&mut self, out: &mut [f32]) {
            out.fill(self.0);
        }
    }

    struct TestPool {
        engines: Vec<ConstEngine>,
        retired: Vec<EngineHandle>,
    }

    impl TestPool {
        fn new() -> Self {
            Self {
                engines: vec![ConstEngine(0.0), ConstEngine(1.0), ConstEngine(2.0)],
                retired: vec![],
            }
        }
    }

    impl EnginePool for TestPool {
        type E = ConstEngine;

        fn engine_mut(&mut self, handle: EngineHandle) -> &mut Self::E {
            &mut self.engines[handle as usize]
        }

        fn retire(&mut self, handle: EngineHandle) {
            self.retired.push(handle);
        }
    }

    #[test]
    fn crossfade_retires_old_handle() {
        let shared = Arc::new(LaneShared::new(super::super::hotswap_lane_level12::SwapPolicy::RejectBusy));
        let mut pool = TestPool::new();
        let mut lane = RtLane::new(shared.clone(), 0, 8);

        let t = Ticket { id: 1, target: 1, at_frame: 0, prewarm_blocks: 0, fade_frames: 8 };
        assert!(matches!(shared.try_schedule(t), super::super::hotswap_lane_level12::ScheduleResult::Accepted));

        let mut out = [0.0f32; 8];
        lane.process_block(&mut pool, &mut out);

        while let Some(h) = shared.host_take_retired() {
            pool.retire(h);
        }

        assert_eq!(pool.retired, vec![0]);
        assert_eq!(lane.current_handle(), 1);
    }
}

//! Conformance harness for Level 1/2 wiring.

use super::hotswap_engine_api::{Engine, EngineHandle, EnginePool};

#[derive(Clone)]
struct ConstEngine(f32);

impl Engine for ConstEngine {
    fn render(&mut self, out: &mut [f32]) {
        out.fill(self.0);
    }
}

struct TestPool {
    engines: Vec<ConstEngine>,
    retired: Vec<EngineHandle>,
}

impl TestPool {
    fn new(vals: &[f32]) -> Self {
        Self {
            engines: vals.iter().copied().map(ConstEngine).collect(),
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

#[cfg(test)]
mod tests {
    use super::*;

    use super::super::hotswap_host_orchestrator::HostOrchestrator;
    use super::super::hotswap_lane_level12::{ScheduleResult, SwapPolicy, Ticket};
    use super::super::hotswap_lane_shared::LaneShared;
    use super::super::hotswap_rt_lane::RtLane;

    #[test]
    fn spam_requests_latest_wins_once_idle() {
        let pool = TestPool::new(&[0.0, 1.0, 2.0, 3.0]);
        let mut host = HostOrchestrator::<TestPool>::new(SwapPolicy::RejectBusy, pool);

        let shared = host.lane();
        let mut rt = RtLane::new(shared.clone(), 0, 8);

        // "Spam": multiple requests before RT has a chance to take.
        host.request_swap_latest_wins(1, 0, 0, 8);
        host.request_swap_latest_wins(2, 0, 0, 8);
        host.request_swap_latest_wins(3, 0, 0, 8);

        let mut out = [0.0f32; 8];
        for _ in 0..4 {
            rt.process_block(host.pool_mut(), &mut out);
            host.tick();
        }

        assert_eq!(rt.current_handle(), 3);
        assert_eq!(host.pool_mut().retired, vec![0, 1]);

        let stats = host.stats_snapshot();
        assert!(stats.schedule_rejected_busy_total >= 2);
    }

    #[test]
    fn retired_ring_overflows_without_draining() {
        let shared = std::sync::Arc::new(LaneShared::<EngineHandle>::new(SwapPolicy::RejectBusy));
        let mut pool = TestPool::new(&[0.0, 1.0, 2.0, 3.0]);
        let mut rt = RtLane::new(shared.clone(), 0, 8);

        for i in 1..=64u64 {
            let target = (i % 4) as EngineHandle;
            let t = Ticket {
                id: i,
                target,
                at_frame: 0,
                prewarm_blocks: 0,
                fade_frames: 1,
            };

            loop {
                if shared.try_schedule(t) == ScheduleResult::Accepted {
                    break;
                }
                core::hint::spin_loop();
            }

            let mut out = [0.0f32; 8];
            rt.process_block(&mut pool, &mut out);
        }

        let stats = shared.stats_snapshot();
        assert!(stats.retired_pushed_total > 0);
        assert!(stats.retired_overflow_total > 0);
    }
}

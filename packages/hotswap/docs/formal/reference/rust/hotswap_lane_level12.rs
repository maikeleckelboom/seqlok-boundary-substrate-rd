//! Level 1/2 ticket staging gate.
//!
//! - Level 1: `single`
//! - Level 2: `reject-busy` (overlap => `RejectedBusy`)
//!
//! State machine:
//!   IDLE -> ARMING -> ARMED -> BUSY -> IDLE
//!
//! Safety goal: RT can never observe partially-written ticket data.

use core::mem::MaybeUninit;

use super::sync::{AtomicUsize, Ordering, UnsafeCell};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SwapPolicy {
    /// Level 1: one in-flight swap.
    ///
    /// Overlap behavior is not promised by the taxonomy, but this reference
    /// rejects overlap defensively.
    Single,

    /// Level 2: overlap defined as "reject while busy".
    RejectBusy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScheduleResult {
    Accepted,
    RejectedBusy,
}

/// Minimal ticket shape.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Ticket<T: Copy> {
    pub id: u64,
    pub target: T,
    pub at_frame: u64,
    pub prewarm_blocks: u32,
    pub fade_frames: u32,
}

#[repr(usize)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SlotState {
    Idle = 0,
    Arming = 1,
    Armed = 2,
    Busy = 3,
}

/// A bounded, lock-free staging slot for one accepted swap ticket.
pub struct LaneRuntime<T: Copy + Send> {
    policy: SwapPolicy,
    state: AtomicUsize,
    slot: UnsafeCell<MaybeUninit<Ticket<T>>>,
}

unsafe impl<T: Copy + Send> Sync for LaneRuntime<T> {}

impl<T: Copy + Send> LaneRuntime<T> {
    pub fn new(policy: SwapPolicy) -> Self {
        Self {
            policy,
            state: AtomicUsize::new(SlotState::Idle as usize),
            slot: UnsafeCell::new(MaybeUninit::uninit()),
        }
    }

    pub fn policy(&self) -> SwapPolicy {
        self.policy
    }

    pub fn is_busy(&self) -> bool {
        self.state.load(Ordering::Acquire) != SlotState::Idle as usize
    }

    pub fn try_schedule(&self, ticket: Ticket<T>) -> ScheduleResult {
        let reserved = self
            .state
            .compare_exchange(
                SlotState::Idle as usize,
                SlotState::Arming as usize,
                Ordering::Acquire,
                Ordering::Relaxed,
            )
            .is_ok();

        if !reserved {
            return ScheduleResult::RejectedBusy;
        }

        // SAFETY: We own the slot because we moved state to ARMING.
        unsafe { (*self.slot.get()).write(ticket) };

        // Publish the ticket to RT.
        self.state.store(SlotState::Armed as usize, Ordering::Release);
        ScheduleResult::Accepted
    }

    pub fn rt_try_take(&self) -> Option<Ticket<T>> {
        let taken = self
            .state
            .compare_exchange(
                SlotState::Armed as usize,
                SlotState::Busy as usize,
                Ordering::AcqRel,
                Ordering::Acquire,
            )
            .is_ok();

        if !taken {
            return None;
        }

        Some(unsafe { (*self.slot.get()).assume_init_read() })
    }

    pub fn rt_mark_idle(&self) {
        self.state.store(SlotState::Idle as usize, Ordering::Release);
    }
}

/// Minimal trait so helpers can operate over `LaneRuntime` and `LaneShared`.
pub trait Scheduler<T: Copy + Send> {
    fn try_schedule(&self, ticket: Ticket<T>) -> ScheduleResult;
}

impl<T: Copy + Send> Scheduler<T> for LaneRuntime<T> {
    fn try_schedule(&self, ticket: Ticket<T>) -> ScheduleResult {
        self.try_schedule(ticket)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::sync::Arc;

    #[test]
    fn schedule_then_take_roundtrip() {
        let lane = LaneRuntime::<u32>::new(SwapPolicy::RejectBusy);

        let t = Ticket { id: 1, target: 42, at_frame: 123, prewarm_blocks: 2, fade_frames: 8 };

        assert_eq!(lane.try_schedule(t), ScheduleResult::Accepted);
        let got = lane.rt_try_take().expect("ticket should be available");
        assert_eq!(got, t);

        lane.rt_mark_idle();
        assert!(!lane.is_busy());
    }

    #[test]
    fn concurrent_host_schedule_never_torns_ticket() {
        let lane = Arc::new(LaneRuntime::<u64>::new(SwapPolicy::RejectBusy));

        let rt_lane = lane.clone();
        let rt = super::super::sync::thread::spawn(move || {
            let mut seen = 0u64;
            while seen < 10_000 {
                if let Some(t) = rt_lane.rt_try_take() {
                    assert_eq!(t.target, t.id);
                    seen += 1;
                    rt_lane.rt_mark_idle();
                }
            }
        });

        let host_lane = lane.clone();
        let host = super::super::sync::thread::spawn(move || {
            for i in 1..=10_000u64 {
                let t = Ticket { id: i, target: i, at_frame: i * 64, prewarm_blocks: 0, fade_frames: 1 };
                loop {
                    if host_lane.try_schedule(t) == ScheduleResult::Accepted {
                        break;
                    }
                    core::hint::spin_loop();
                }
            }
        });

        host.join().unwrap();
        rt.join().unwrap();
    }
}

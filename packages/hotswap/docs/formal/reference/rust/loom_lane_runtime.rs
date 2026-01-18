#![cfg(loom)]

// Run with:
//   RUSTFLAGS="--cfg loom" cargo test --test loom_lane_runtime --release :contentReference[oaicite:4]{index=4}

use crate::reference::rust::sync::{self, Arc, AtomicUsize, Ordering};
use crate::reference::rust::hotswap_lane_level12::{LaneRuntime, ScheduleResult, SwapPolicy, Ticket};

use loom::thread;

fn ticket(id: u64) -> Ticket<u64> {
    Ticket {
        id,
        target: id,        // invariant we can sanity-check (no torn reads)
        at_frame: id * 64,
        prewarm_blocks: 0,
        fade_frames: 64,
    }
}

#[test]
fn loom_no_torn_ticket_publish() {
    loom::model(|| {
        let lane = Arc::new(LaneRuntime::<u64>::new(SwapPolicy::RejectBusy));

        let lane_h = lane.clone();
        let host = thread::spawn(move || {
            assert_eq!(lane_h.try_schedule(ticket(1)), ScheduleResult::Accepted);
        });

        let lane_r = lane.clone();
        let rt = thread::spawn(move || {
            loop {
                if let Some(t) = lane_r.rt_try_take() {
                    assert_eq!(t.target, t.id);
                    lane_r.rt_mark_idle();
                    break;
                }
                sync::yield_now();
            }
        });

        host.join().unwrap();
        rt.join().unwrap();
    });
}

#[test]
fn loom_reject_while_busy_until_mark_idle() {
    loom::model(|| {
        let lane = Arc::new(LaneRuntime::<u64>::new(SwapPolicy::RejectBusy));

        // Simple 2-step coordination so we explore interleavings but keep the model small.
        // step = 0: host schedules t1 + immediately attempts t2
        // step = 1: rt consumes t1 and marks idle
        let step = Arc::new(AtomicUsize::new(0));

        let lane_h = lane.clone();
        let step_h = step.clone();
        let host = thread::spawn(move || {
            // First schedule must accept.
            assert_eq!(lane_h.try_schedule(ticket(1)), ScheduleResult::Accepted);

            // Second schedule must reject because state != IDLE (either ARMED or BUSY).
            assert_eq!(lane_h.try_schedule(ticket(2)), ScheduleResult::RejectedBusy);

            // Allow RT to finish swap.
            step_h.store(1, Ordering::Release);

            // Wait for RT to return idle.
            while step_h.load(Ordering::Acquire) != 2 {
                sync::yield_now();
            }

            // Now it must accept.
            assert_eq!(lane_h.try_schedule(ticket(2)), ScheduleResult::Accepted);
        });

        let lane_r = lane.clone();
        let step_r = step.clone();
        let rt = thread::spawn(move || {
            // Wait until host has attempted the second schedule.
            while step_r.load(Ordering::Acquire) != 1 {
                sync::yield_now();
            }

            // Consume t1 (must eventually appear), then mark idle.
            loop {
                if let Some(t) = lane_r.rt_try_take() {
                    assert_eq!(t.id, 1);
                    lane_r.rt_mark_idle();
                    break;
                }
                sync::yield_now();
            }

            step_r.store(2, Ordering::Release);
        });

        host.join().unwrap();
        rt.join().unwrap();
    });
}

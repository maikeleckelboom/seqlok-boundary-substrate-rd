//! Host-side helper: bounded "latest intent" mailbox.

use super::hotswap_lane_level12::{ScheduleResult, Scheduler, Ticket};
use super::sync::Mutex;

pub struct LatestIntentMailbox<T: Copy + Send> {
    pending: Mutex<Option<Ticket<T>>>,
}

impl<T: Copy + Send> LatestIntentMailbox<T> {
    pub fn new() -> Self {
        Self { pending: Mutex::new(None) }
    }

    pub fn submit<S: Scheduler<T> + ?Sized>(&self, scheduler: &S, t: Ticket<T>) {
        match scheduler.try_schedule(t) {
            ScheduleResult::Accepted => {
                let _ = self.pending.lock().unwrap().take();
            }
            ScheduleResult::RejectedBusy => {
                *self.pending.lock().unwrap() = Some(t);
            }
        }
    }

    pub fn flush_once<S: Scheduler<T> + ?Sized>(&self, scheduler: &S) {
        let pending = self.pending.lock().unwrap().take();
        if let Some(t) = pending {
            match scheduler.try_schedule(t) {
                ScheduleResult::Accepted => {}
                ScheduleResult::RejectedBusy => {
                    *self.pending.lock().unwrap() = Some(t);
                }
            }
        }
    }

    pub fn has_pending(&self) -> bool {
        self.pending.lock().unwrap().is_some()
    }
}

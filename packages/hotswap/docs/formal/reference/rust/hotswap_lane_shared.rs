//! Shared lane wrapper used by both host and RT.

use core::mem::MaybeUninit;

use super::hotswap_lane_level12::{LaneRuntime, ScheduleResult, Scheduler, SwapPolicy, Ticket};
use super::sync::{AtomicU64, AtomicUsize, Ordering, UnsafeCell};

const RETIRED_RING_LEN: usize = 8;

pub struct LaneStatsSnapshot {
    pub schedule_accepted_total: u64,
    pub schedule_rejected_busy_total: u64,
    pub rt_tickets_taken_total: u64,
    pub rt_mark_idle_total: u64,
    pub retired_pushed_total: u64,
    pub retired_popped_total: u64,
    pub retired_overflow_total: u64,
}

struct RetiredRing<T: Copy + Send> {
    head: AtomicUsize,
    tail: AtomicUsize,
    overflow: AtomicU64,
    buf: [UnsafeCell<MaybeUninit<T>>; RETIRED_RING_LEN],
}

unsafe impl<T: Copy + Send> Sync for RetiredRing<T> {}

impl<T: Copy + Send> RetiredRing<T> {
    fn new() -> Self {
        let buf: [UnsafeCell<MaybeUninit<T>>; RETIRED_RING_LEN] =
            core::array::from_fn(|_| UnsafeCell::new(MaybeUninit::uninit()));

        Self {
            head: AtomicUsize::new(0),
            tail: AtomicUsize::new(0),
            overflow: AtomicU64::new(0),
            buf,
        }
    }

    fn push(&self, v: T) {
        let head = self.head.load(Ordering::Relaxed);
        let next = (head + 1) % RETIRED_RING_LEN;
        let tail = self.tail.load(Ordering::Acquire);

        if next == tail {
            self.overflow.fetch_add(1, Ordering::Relaxed);
            return;
        }

        unsafe { (*self.buf[head].get()).write(v) };
        self.head.store(next, Ordering::Release);
    }

    fn pop(&self) -> Option<T> {
        let tail = self.tail.load(Ordering::Relaxed);
        let head = self.head.load(Ordering::Acquire);

        if tail == head {
            return None;
        }

        let v = unsafe { (*self.buf[tail].get()).assume_init_read() };
        let next = (tail + 1) % RETIRED_RING_LEN;
        self.tail.store(next, Ordering::Release);
        Some(v)
    }

    fn overflow_total(&self) -> u64 {
        self.overflow.load(Ordering::Relaxed)
    }
}

pub struct LaneShared<T: Copy + Send> {
    gate: LaneRuntime<T>,

    schedule_accepted: AtomicU64,
    schedule_rejected_busy: AtomicU64,
    rt_taken: AtomicU64,
    rt_mark_idle: AtomicU64,

    retired_ring: RetiredRing<T>,
    retired_pushed: AtomicU64,
    retired_popped: AtomicU64,
}

unsafe impl<T: Copy + Send> Sync for LaneShared<T> {}

impl<T: Copy + Send> LaneShared<T> {
    pub fn new(policy: SwapPolicy) -> Self {
        Self {
            gate: LaneRuntime::new(policy),
            schedule_accepted: AtomicU64::new(0),
            schedule_rejected_busy: AtomicU64::new(0),
            rt_taken: AtomicU64::new(0),
            rt_mark_idle: AtomicU64::new(0),
            retired_ring: RetiredRing::new(),
            retired_pushed: AtomicU64::new(0),
            retired_popped: AtomicU64::new(0),
        }
    }

    pub fn policy(&self) -> SwapPolicy {
        self.gate.policy()
    }

    pub fn is_busy(&self) -> bool {
        self.gate.is_busy()
    }

    pub fn try_schedule(&self, ticket: Ticket<T>) -> ScheduleResult {
        let r = self.gate.try_schedule(ticket);
        match r {
            ScheduleResult::Accepted => {
                self.schedule_accepted.fetch_add(1, Ordering::Relaxed);
            }
            ScheduleResult::RejectedBusy => {
                self.schedule_rejected_busy.fetch_add(1, Ordering::Relaxed);
            }
        }
        r
    }

    pub fn rt_try_take(&self) -> Option<Ticket<T>> {
        let t = self.gate.rt_try_take();
        if t.is_some() {
            self.rt_taken.fetch_add(1, Ordering::Relaxed);
        }
        t
    }

    pub fn rt_mark_idle(&self) {
        self.gate.rt_mark_idle();
        self.rt_mark_idle.fetch_add(1, Ordering::Relaxed);
    }

    pub fn rt_publish_retired(&self, handle: T) {
        self.retired_ring.push(handle);
        self.retired_pushed.fetch_add(1, Ordering::Relaxed);
    }

    pub fn host_take_retired(&self) -> Option<T> {
        let v = self.retired_ring.pop();
        if v.is_some() {
            self.retired_popped.fetch_add(1, Ordering::Relaxed);
        }
        v
    }

    pub fn stats_snapshot(&self) -> LaneStatsSnapshot {
        LaneStatsSnapshot {
            schedule_accepted_total: self.schedule_accepted.load(Ordering::Relaxed),
            schedule_rejected_busy_total: self.schedule_rejected_busy.load(Ordering::Relaxed),
            rt_tickets_taken_total: self.rt_taken.load(Ordering::Relaxed),
            rt_mark_idle_total: self.rt_mark_idle.load(Ordering::Relaxed),
            retired_pushed_total: self.retired_pushed.load(Ordering::Relaxed),
            retired_popped_total: self.retired_popped.load(Ordering::Relaxed),
            retired_overflow_total: self.retired_ring.overflow_total(),
        }
    }
}

impl<T: Copy + Send> Scheduler<T> for LaneShared<T> {
    fn try_schedule(&self, ticket: Ticket<T>) -> ScheduleResult {
        self.try_schedule(ticket)
    }
}

//! Minimal shim so the same core logic can be tested under `loom`.

#[cfg(loom)]
pub use loom::cell::UnsafeCell;
#[cfg(not(loom))]
pub use core::cell::UnsafeCell;

#[cfg(loom)]
pub use loom::sync::{Arc, Mutex};
#[cfg(not(loom))]
pub use std::sync::{Arc, Mutex};

#[cfg(loom)]
pub use loom::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
#[cfg(not(loom))]
pub use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};

#[cfg(loom)]
pub use loom::thread;
#[cfg(not(loom))]
pub use std::thread;

#[inline]
pub fn yield_now() {
    #[cfg(loom)]
    loom::thread::yield_now();
    #[cfg(not(loom))]
    std::thread::yield_now();
}

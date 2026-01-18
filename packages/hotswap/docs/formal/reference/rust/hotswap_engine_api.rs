//! Minimal engine traits used by the reference RT lane.

/// Opaque handle used to refer to an engine instance.
pub type EngineHandle = u32;

pub trait Engine: Send {
    fn render(&mut self, out: &mut [f32]);
}

pub trait EnginePool: Send {
    type E: Engine;

    fn engine_mut(&mut self, handle: EngineHandle) -> &mut Self::E;
    fn retire(&mut self, handle: EngineHandle);
}

#[inline]
pub fn mix_linear(out: &mut [f32], a: &[f32], b: &[f32], t: f32) {
    debug_assert_eq!(out.len(), a.len());
    debug_assert_eq!(out.len(), b.len());
    let ta = 1.0_f32 - t;
    for i in 0..out.len() {
        out[i] = a[i] * ta + b[i] * t;
    }
}

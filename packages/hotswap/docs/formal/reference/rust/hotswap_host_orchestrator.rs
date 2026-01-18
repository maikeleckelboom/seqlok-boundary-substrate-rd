//! Host orchestration for Levels 1–2.

use super::hotswap_engine_api::{EngineHandle, EnginePool};
use super::hotswap_lane_level12::{SwapPolicy, Ticket};
use super::hotswap_lane_shared::{LaneShared, LaneStatsSnapshot};
use super::latest_intent_mailbox::LatestIntentMailbox;
use super::sync::Arc;

pub struct HostOrchestrator<P: EnginePool> {
    lane: Arc<LaneShared<EngineHandle>>,
    pool: P,
    latest: LatestIntentMailbox<EngineHandle>,
    next_ticket_id: u64,
}

impl<P: EnginePool> HostOrchestrator<P> {
    pub fn new(policy: SwapPolicy, pool: P) -> Self {
        Self {
            lane: Arc::new(LaneShared::new(policy)),
            pool,
            latest: LatestIntentMailbox::new(),
            next_ticket_id: 1,
        }
    }

    pub fn lane(&self) -> Arc<LaneShared<EngineHandle>> {
        self.lane.clone()
    }

    pub fn pool_mut(&mut self) -> &mut P {
        &mut self.pool
    }

    pub fn request_swap_latest_wins(
        &mut self,
        target: EngineHandle,
        at_frame: u64,
        prewarm_blocks: u32,
        fade_frames: u32,
    ) {
        let t = Ticket {
            id: self.next_ticket_id,
            target,
            at_frame,
            prewarm_blocks,
            fade_frames,
        };
        self.next_ticket_id = self.next_ticket_id.wrapping_add(1);

        self.latest.submit(self.lane.as_ref(), t);
    }

    pub fn tick(&mut self) {
        self.latest.flush_once(self.lane.as_ref());

        while let Some(h) = self.lane.host_take_retired() {
            self.pool.retire(h);
        }
    }

    pub fn stats_snapshot(&self) -> LaneStatsSnapshot {
        self.lane.stats_snapshot()
    }

    pub fn has_pending_intent(&self) -> bool {
        self.latest.has_pending()
    }
}

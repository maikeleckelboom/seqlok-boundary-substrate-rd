------------------------------- MODULE HotSwapPersistentHandoff -------------------------------
(***************************************************************************
  TLA+ specification for the successful persistent-handoff continuity path.

  Scope of this module:
  - one admitted persistent handoff per behavior
  - capture -> install -> catchup -> prewarm? -> crossfade -> retire
  - no explicit downgrade or abort branches yet

  Overlap policy is intentionally not modeled here.
***************************************************************************)

EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
  MAX_PREWARM_BLOCKS,
  MAX_FADE_FRAMES,
  BLOCK_FRAMES

ASSUME MAX_PREWARM_BLOCKS \in Nat
ASSUME MAX_FADE_FRAMES \in Nat
ASSUME BLOCK_FRAMES \in Nat \ {0}

VARIABLES
  phase,
  hasTicket,
  preWarmBlocksRemaining,
  fadeFramesRemaining,
  totalFadeFrames,
  currentEngine,
  nextEngine,
  snapshotState,
  continuityRequested,
  continuityGranted,
  swapsAccepted

vars == <<
  phase,
  hasTicket,
  preWarmBlocksRemaining,
  fadeFramesRemaining,
  totalFadeFrames,
  currentEngine,
  nextEngine,
  snapshotState,
  continuityRequested,
  continuityGranted,
  swapsAccepted
>>

Phases == {"idle", "spawn", "capture", "install", "catchup", "prewarm", "crossfade", "retire"}
Engines == {"Engine1", "Engine2", "NoEngine"}
SnapshotStates == {"none", "captured", "installed", "replayed"}
ContinuityRequirements == {"persistent"}
ContinuityGranteds == {"cold", "persistent"}

TypeOK ==
  /\ phase \in Phases
  /\ hasTicket \in BOOLEAN
  /\ preWarmBlocksRemaining \in 0..MAX_PREWARM_BLOCKS
  /\ fadeFramesRemaining \in 0..MAX_FADE_FRAMES
  /\ totalFadeFrames \in 0..MAX_FADE_FRAMES
  /\ currentEngine \in Engines
  /\ nextEngine \in Engines
  /\ snapshotState \in SnapshotStates
  /\ continuityRequested \in ContinuityRequirements
  /\ continuityGranted \in ContinuityGranteds
  /\ swapsAccepted \in 0..1

Init ==
  /\ phase = "idle"
  /\ hasTicket = FALSE
  /\ preWarmBlocksRemaining = 0
  /\ fadeFramesRemaining = 0
  /\ totalFadeFrames = 0
  /\ currentEngine = "Engine1"
  /\ nextEngine = "NoEngine"
  /\ snapshotState = "none"
  /\ continuityRequested = "persistent"
  /\ continuityGranted = "cold"
  /\ swapsAccepted = 0

AtMostTwoEngines ==
  /\ currentEngine # "NoEngine"
  /\ nextEngine \in Engines

NoGapDuringCrossfade ==
  phase = "crossfade" => currentEngine # "NoEngine" /\ nextEngine # "NoEngine"

CrossfadeEnginesDistinct ==
  phase = "crossfade" => currentEngine # nextEngine

AcceptTicket(prewarm, fade) ==
  /\ phase = "idle"
  /\ swapsAccepted = 0
  /\ prewarm \in 0..MAX_PREWARM_BLOCKS
  /\ fade \in 1..MAX_FADE_FRAMES
  /\ phase' = "spawn"
  /\ hasTicket' = TRUE
  /\ preWarmBlocksRemaining' = prewarm
  /\ fadeFramesRemaining' = fade
  /\ totalFadeFrames' = fade
  /\ nextEngine' = "Engine2"
  /\ snapshotState' = "none"
  /\ continuityRequested' = "persistent"
  /\ continuityGranted' = "cold"
  /\ swapsAccepted' = 1
  /\ UNCHANGED <<currentEngine>>

StepSpawn ==
  /\ phase = "spawn"
  /\ phase' = "capture"
  /\ UNCHANGED <<hasTicket, preWarmBlocksRemaining, fadeFramesRemaining,
                 totalFadeFrames, currentEngine, nextEngine, snapshotState,
                 continuityRequested, continuityGranted, swapsAccepted>>

StepCapture ==
  /\ phase = "capture"
  /\ snapshotState = "none"
  /\ snapshotState' = "captured"
  /\ phase' = "install"
  /\ UNCHANGED <<hasTicket, preWarmBlocksRemaining, fadeFramesRemaining,
                 totalFadeFrames, currentEngine, nextEngine,
                 continuityRequested, continuityGranted, swapsAccepted>>

StepInstall ==
  /\ phase = "install"
  /\ snapshotState = "captured"
  /\ snapshotState' = "installed"
  /\ continuityGranted' = "persistent"
  /\ phase' = "catchup"
  /\ UNCHANGED <<hasTicket, preWarmBlocksRemaining, fadeFramesRemaining,
                 totalFadeFrames, currentEngine, nextEngine,
                 continuityRequested, swapsAccepted>>

StepCatchup ==
  /\ phase = "catchup"
  /\ snapshotState = "installed"
  /\ snapshotState' = "replayed"
  /\ phase' = IF preWarmBlocksRemaining > 0 THEN "prewarm" ELSE "crossfade"
  /\ UNCHANGED <<hasTicket, preWarmBlocksRemaining, fadeFramesRemaining,
                 totalFadeFrames, currentEngine, nextEngine,
                 continuityRequested, continuityGranted, swapsAccepted>>

StepPrewarm ==
  /\ phase = "prewarm"
  /\ IF preWarmBlocksRemaining > 1
        THEN /\ preWarmBlocksRemaining' = preWarmBlocksRemaining - 1
             /\ phase' = "prewarm"
        ELSE /\ preWarmBlocksRemaining' = 0
             /\ phase' = "crossfade"
  /\ UNCHANGED <<hasTicket, fadeFramesRemaining, totalFadeFrames,
                 currentEngine, nextEngine, snapshotState,
                 continuityRequested, continuityGranted, swapsAccepted>>

StepCrossfade ==
  /\ phase = "crossfade"
  /\ IF fadeFramesRemaining > BLOCK_FRAMES
        THEN /\ fadeFramesRemaining' = fadeFramesRemaining - BLOCK_FRAMES
             /\ phase' = "crossfade"
        ELSE /\ fadeFramesRemaining' = 0
             /\ phase' = "retire"
  /\ UNCHANGED <<hasTicket, preWarmBlocksRemaining, totalFadeFrames,
                 currentEngine, nextEngine, snapshotState,
                 continuityRequested, continuityGranted, swapsAccepted>>

StepRetire ==
  /\ phase = "retire"
  /\ phase' = "idle"
  /\ hasTicket' = FALSE
  /\ currentEngine' = nextEngine
  /\ nextEngine' = "NoEngine"
  /\ preWarmBlocksRemaining' = 0
  /\ fadeFramesRemaining' = 0
  /\ totalFadeFrames' = 0
  /\ snapshotState' = "none"
  /\ UNCHANGED <<continuityRequested, continuityGranted, swapsAccepted>>

StepIdle ==
  /\ phase = "idle"
  /\ UNCHANGED vars

Next ==
  (\E prewarm \in 0..MAX_PREWARM_BLOCKS, fade \in 1..MAX_FADE_FRAMES :
      AcceptTicket(prewarm, fade))
  \/ StepSpawn
  \/ StepCapture
  \/ StepInstall
  \/ StepCatchup
  \/ StepPrewarm
  \/ StepCrossfade
  \/ StepRetire
  \/ StepIdle

NoSilentDowngrade ==
  continuityRequested = "persistent" /\ phase = "crossfade" => continuityGranted = "persistent"

SnapshotLineageConsistency ==
  /\ snapshotState # "none" => continuityRequested = "persistent"
  /\ snapshotState = "captured" => phase \in {"install", "catchup", "prewarm", "crossfade", "retire"}
  /\ snapshotState = "installed" => phase \in {"catchup", "prewarm", "crossfade", "retire"}
  /\ snapshotState = "replayed" => phase \in {"prewarm", "crossfade", "retire"}
  /\ snapshotState = "replayed" => continuityGranted = "persistent"

RetireAfterPersistentInstall ==
  phase = "retire" => snapshotState = "replayed" /\ continuityGranted = "persistent"

NoCrossfadeBeforeReplay ==
  phase = "crossfade" => snapshotState = "replayed"

EventuallyIdle ==
  phase # "idle" ~> phase = "idle"

PersistentSwapEventuallyResolves ==
  hasTicket ~> (phase = "idle" /\ continuityGranted = "persistent")

NoCaptureLivelock ==
  phase = "capture" ~> phase # "capture"

NoInstallLivelock ==
  phase = "install" ~> phase # "install"

NoCatchupLivelock ==
  phase = "catchup" ~> phase # "catchup"

NoLivelockPrewarm ==
  phase = "prewarm" ~> phase # "prewarm"

NoLivelockCrossfade ==
  phase = "crossfade" ~> phase # "crossfade"

Fairness ==
  /\ WF_vars(StepSpawn)
  /\ WF_vars(StepCapture)
  /\ WF_vars(StepInstall)
  /\ WF_vars(StepCatchup)
  /\ WF_vars(StepPrewarm)
  /\ WF_vars(StepCrossfade)
  /\ WF_vars(StepRetire)

Spec == Init /\ [][Next]_vars /\ Fairness

=============================================================================

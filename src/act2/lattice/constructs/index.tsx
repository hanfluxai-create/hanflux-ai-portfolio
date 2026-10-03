/* ============================================================================
   Construct registry — one hero object per station along the Lattice.
   Division constructs (1..6) sit RIGHT of the flight path (the copy owns the
   left); the rest straddle the path so the camera flies through/between them.
   ========================================================================== */
import type { ComponentType } from 'react'
import { LATTICE, stationZ, type ConstructProps, type LatticeTier } from '../shared'
import { VoiceConstruct } from './Voice'
import { FoundryConstruct } from './Foundry'
import { OrchestrationConstruct } from './Orchestration'
import { MemoryConstruct } from './Memory'
import { GrowthConstruct } from './Growth'
import { OpsConstruct } from './Ops'
import { LoopConstruct } from './Loop'
import { CodeWallConstruct } from './CodeWall'
import { StackConstruct } from './Stack'
import { MetricsConstruct } from './Metrics'
import { DoorsConstruct } from './Doors'
import { SingularityConstruct } from './Singularity'

type Entry = {
  station: number
  C: ComponentType<ConstructProps>
  position: [number, number, number]
  accent: string
}

const X = LATTICE.SIDE_X

export const CONSTRUCTS: Entry[] = [
  { station: 1, C: VoiceConstruct, position: [X, 1, stationZ(1)], accent: '#27F2C0' },
  { station: 2, C: FoundryConstruct, position: [X, 1, stationZ(2)], accent: '#7C5CFF' },
  // the flow graph is wide (12 units): nudge it right so it clears the headline
  { station: 3, C: OrchestrationConstruct, position: [X + 1.6, 1, stationZ(3)], accent: '#4EA8FF' },
  { station: 4, C: MemoryConstruct, position: [X, 1, stationZ(4)], accent: '#FFB36B' },
  { station: 5, C: GrowthConstruct, position: [X, 1, stationZ(5)], accent: '#FF3D7F' },
  { station: 6, C: OpsConstruct, position: [X, 1, stationZ(6)], accent: '#9AE6FF' },
  { station: 7, C: LoopConstruct, position: [0, 1.5, stationZ(7)], accent: '#4EA8FF' },
  { station: 8, C: CodeWallConstruct, position: [0, 2, stationZ(8)], accent: '#27F2C0' },
  { station: 9, C: StackConstruct, position: [0, 0, stationZ(9)], accent: '#FFB36B' },
  { station: 10, C: MetricsConstruct, position: [0, 0, stationZ(10)], accent: '#27F2C0' },
  { station: 11, C: DoorsConstruct, position: [0, 0, stationZ(11)], accent: '#9AE6FF' },
  { station: 12, C: SingularityConstruct, position: [0, 2, stationZ(12) - 40], accent: '#4CF0FF' },
]

export function Constructs({ tier }: { tier: LatticeTier }) {
  return (
    <>
      {CONSTRUCTS.map(({ station, C, position, accent }) => (
        <C key={station} station={station} position={position} accent={accent} tier={tier} />
      ))}
    </>
  )
}

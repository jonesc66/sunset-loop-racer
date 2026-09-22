import {createContext, useContext} from 'react';
import type {GraphicsQuality} from '../game/types';
export const NeonNightQuality=createContext<GraphicsQuality>('high');
export const useNeonNightQuality=()=>useContext(NeonNightQuality);
export const nightPresets={
 performance:{lights:0,bloom:0,bloomScale:.25,shadow:0,shadowExtent:30,spillDistance:100,fogFar:400},
 low:{lights:0,bloom:0,bloomScale:.25,shadow:0,shadowExtent:30,spillDistance:125,fogFar:420},
 medium:{lights:1,bloom:0,bloomScale:.25,shadow:0,shadowExtent:40,spillDistance:150,fogFar:440},
 high:{lights:2,bloom:.16,bloomScale:.25,shadow:1024,shadowExtent:48,spillDistance:180,fogFar:465},
 gpu:{lights:3,bloom:.23,bloomScale:.4,shadow:2048,shadowExtent:65,spillDistance:220,fogFar:485},
} as const;

/*
 * Zod enum schemas derived directly from the core enum objects, so they can
 * never drift from the simulation. z.nativeEnum ties each schema to the exact
 * const object in game/types/enums.ts.
 */
import { z } from './zod.ts';
import {
  CastleType,
  FieldStatus,
  HealthLevel,
  NoblePersonality,
  RationLevel,
  Season,
} from '../../game/types/enums.ts';

export const RationLevelSchema = z.nativeEnum(RationLevel).openapi('RationLevel');
export const FieldStatusSchema = z.nativeEnum(FieldStatus).openapi('FieldStatus');
export const CastleTypeSchema = z.nativeEnum(CastleType).openapi('CastleType');
export const HealthLevelSchema = z.nativeEnum(HealthLevel).openapi('HealthLevel');
export const SeasonSchema = z.nativeEnum(Season).openapi('Season');
export const NoblePersonalitySchema = z.nativeEnum(NoblePersonality).openapi('NoblePersonality');

/** Field uses a player may assign directly (subset of FieldStatus). */
export const FieldUseSchema = z
  .enum([FieldStatus.Fallow, FieldStatus.Grain, FieldStatus.Cattle])
  .openapi('FieldUse');

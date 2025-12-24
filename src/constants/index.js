/**
 * Application constants for Turni OSS
 * Shift scheduling application for healthcare cooperatives
 */

import { ArrowRight, Ban, Timer, Repeat, Link } from 'lucide-react';

// ============================================
// SHIFT TYPE DEFINITIONS
// ============================================

export const DEFAULT_SHIFT_TYPES = [
  { id: 'M', name: 'Mattina', hours: 6, color: '#FCD34D', textColor: '#1a1a1a' },
  { id: 'P', name: 'Pomeriggio', hours: 7, color: '#60A5FA', textColor: '#1a1a1a' },
  { id: 'N', name: 'Notte', hours: 4, color: '#1E3A5F', textColor: '#ffffff' },
  { id: 'SN', name: 'Smonto Notte', hours: 7, color: '#6366F1', textColor: '#ffffff' },
  { id: 'RP', name: 'Riposo', hours: 0, color: '#E5E7EB', textColor: '#666666' },
  { id: 'N11', name: 'Notte Lunga', hours: 11, color: '#0F172A', textColor: '#ffffff' },
];

// ============================================
// CONSTRAINT DEFINITIONS
// ============================================

export const DEFAULT_CONSTRAINTS = [
  { id: 'default-1', type: 'must_follow', shiftA: 'SN', shiftB: 'RP', enabled: true },
  { id: 'default-2', type: 'cannot_follow', shiftA: 'RP', shiftB: 'M', enabled: true },
  { id: 'default-3', type: 'max_consecutive_without', shift: 'RP', days: 6, enabled: true },
  { id: 'default-4', type: 'must_precede', shiftA: 'N', shiftB: 'N11', enabled: true },
];

export const CONSTRAINT_TYPES = [
  {
    id: 'must_follow',
    name: 'Deve essere seguito da',
    description: 'Il turno A deve essere immediatamente seguito dal turno B',
    icon: ArrowRight,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    params: ['shiftA', 'shiftB']
  },
  {
    id: 'cannot_follow',
    name: 'Non può essere seguito da',
    description: 'Il turno A non può essere immediatamente seguito dal turno B',
    icon: Ban,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    params: ['shiftA', 'shiftB']
  },
  {
    id: 'must_precede',
    name: 'Deve essere preceduto da',
    description: 'Il turno B deve essere immediatamente preceduto dal turno A',
    icon: ArrowRight,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    params: ['shiftA', 'shiftB']
  },
  {
    id: 'cannot_precede',
    name: 'Non può essere preceduto da',
    description: 'Il turno B non può essere immediatamente preceduto dal turno A',
    icon: Ban,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    params: ['shiftA', 'shiftB']
  },
  {
    id: 'max_consecutive_without',
    name: 'Max giorni consecutivi senza',
    description: 'Massimo N giorni consecutivi senza il turno specificato',
    icon: Timer,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    params: ['shift', 'days']
  },
  {
    id: 'max_consecutive',
    name: 'Max ripetizioni consecutive',
    description: 'Il turno non può ripetersi più di N volte consecutive',
    icon: Repeat,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    params: ['shift', 'days']
  },
  {
    id: 'min_gap',
    name: 'Minimo giorni tra',
    description: 'Devono passare almeno N giorni tra il turno A e il turno B',
    icon: Link,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    params: ['shiftA', 'shiftB', 'days']
  },
];

// ============================================
// PRESET FILES
// ============================================

// List of preset files to load from /presets/ folder
// These files are gitignored - add your private presets there
export const PRESET_FILES = [
  'ROSE.json',
  // Add more preset files here as needed:
  // 'CEDRO.json',
  // 'TAMERICI.json',
];

// ============================================
// CALENDAR CONSTANTS
// ============================================

export const WEEKDAYS = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'];

export const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile',
  'Maggio', 'Giugno', 'Luglio', 'Agosto',
  'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

// ============================================
// DEFAULT FACILITY CONFIGURATION
// ============================================

export const DEFAULT_FACILITY = {
  name: 'Nuova Struttura',
  coverageRules: [
    { id: 'default-m', min: 2, shiftIds: ['M'] },
    { id: 'default-p', min: 2, shiftIds: ['P'] },
    { id: 'default-n', min: 1, shiftIds: ['N'] }
  ]
};

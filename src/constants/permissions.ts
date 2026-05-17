import type { AuthUser } from '@/context/AuthContext'

export type Role = AuthUser['role']

export type NavKey =
  | 'dashboard'
  | 'quotes'
  | 'quotes-list'
  | 'clients'
  | 'gemstones'
  | 'charts'
  | 'history'
  | 'users'
  | 'configuration'
  | 'master-tables'

export const ROLE_PERMISSIONS: Record<Role, NavKey[]> = {
  ADMIN: [
    'dashboard',
    'quotes',
    'quotes-list',
    'clients',
    'gemstones',
    'charts',
    'history',
    'users',
    'configuration',
    'master-tables',
  ],
  MANAGER: ['quotes', 'quotes-list', 'gemstones'],
  JEWELER: ['quotes', 'quotes-list', 'gemstones'],
  SALES: ['quotes', 'quotes-list', 'gemstones'],
  VIEWER: ['quotes', 'quotes-list', 'gemstones'],
}

export function canAccess(role: Role | undefined, key: NavKey): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role]?.includes(key) ?? false
}

export function defaultRouteFor(role: Role | undefined): string {
  if (!role) return '/login'
  if (canAccess(role, 'dashboard')) return '/'
  if (canAccess(role, 'quotes')) return '/quotes'
  if (canAccess(role, 'quotes-list')) return '/quotes-list'
  if (canAccess(role, 'gemstones')) return '/gemstones'
  return '/login'
}

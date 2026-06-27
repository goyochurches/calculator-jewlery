import type { AuthUser } from '@/context/AuthContext'

export type Role = AuthUser['role']

export type NavKey =
  | 'dashboard'
  | 'metals'
  | 'quotes'
  | 'quotes-wizard'
  | 'quotes-list'
  | 'clients'
  | 'gemstones'
  | 'charts'
  | 'history'
  | 'users'
  | 'configuration'
  | 'master-tables'
  | 'payments'
  | 'messages'
  | 'reviews'
  | 'market-prices'

export const ROLE_PERMISSIONS: Record<Role, NavKey[]> = {
  ADMIN: [
    'dashboard',
    'metals',
    'quotes',
    'quotes-wizard',
    'quotes-list',
    'clients',
    'gemstones',
    'charts',
    'history',
    'users',
    'configuration',
    'master-tables',
    'payments',
    'messages',
    'reviews',
    'market-prices',
  ],
  MANAGER: ['quotes', 'quotes-wizard', 'quotes-list', 'gemstones', 'messages', 'market-prices'],
  JEWELER: ['quotes', 'quotes-wizard', 'quotes-list', 'gemstones', 'messages', 'market-prices'],
  SALES:   ['quotes', 'quotes-wizard', 'quotes-list', 'gemstones', 'messages', 'market-prices'],
  VIEWER:  ['quotes', 'quotes-wizard', 'quotes-list', 'gemstones', 'messages', 'market-prices'],
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

import { menuBaseUrl } from '../firebase';

export const tableUrl = (slug: string, table: number) => `${menuBaseUrl}/r/${slug}?t=${table}`;
export const generalUrl = (slug: string) => `${menuBaseUrl}/r/${slug}`;

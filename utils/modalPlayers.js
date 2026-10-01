import { fetchPlayerListPage } from './playerCatalog.js';

export const MODAL_PAGE_SIZE = 30;

export function fetchModalPlayerPage(db, { position, keyword = '', offset = 0, signal }) {
  return fetchPlayerListPage(db, { position, keyword, offset, limit: MODAL_PAGE_SIZE, signal });
}

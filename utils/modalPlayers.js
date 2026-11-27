import { fetchPlayerListPage } from './playerCatalog.js';

export const MODAL_PAGE_SIZE = 15;

export function fetchModalPlayerPage(db, { position, positionMode = 'all', keyword = '', offset = 0, signal, affiliation, maxPrice, includeAcquisitionCards = true }) {
  const isNameSearch = keyword.trim().length > 0;
  return fetchPlayerListPage(db, { position, positionMode, keyword, offset, limit: MODAL_PAGE_SIZE, signal, affiliation, maxPrice: isNameSearch ? undefined : maxPrice, acquisitionCosts: true, includeAcquisitionCards: isNameSearch || includeAcquisitionCards });
}

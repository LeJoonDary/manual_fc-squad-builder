import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { excludedCardVersionsStore, getExcludedCardManagementCount, isSquadOvrRangeCustom } from '../utils/excludedCardVersions.js';
import { searchExclusionCards, fetchExcludedCardDetails, EXCLUSION_SEARCH_PAGE_SIZE,
  exclusionCardName, exclusionCardLabel } from '../utils/exclusionCardSearch.js';

function CardSummary({ card, id, fallbackName }) {
  return <>
    <div className="exclusion-card-art" style={card?.background_url ? { backgroundImage: `url(${JSON.stringify(card.background_url)})` } : undefined}>
      {card?.image_url && <img src={card.image_url} alt="" onError={event => { event.currentTarget.hidden = true; }} />}
      <strong>{card?.overall ?? '—'}</strong>
    </div>
    <div className="exclusion-card-info">
      <strong>{card ? exclusionCardName(card) : fallbackName}</strong>
      <span>{card?.version || (card ? '버전 정보 없음' : '카드 정보 미확인')} · #{id}</span>
    </div>
  </>;
}

function ExclusionDialog({ supabase, onClose }) {
  const exclusionState = useSyncExternalStore(
    excludedCardVersionsStore.subscribe, excludedCardVersionsStore.getState);
  const { excludedCardVersionIds: ids, excludedCardVersionNames: names, squadOvrRange } = exclusionState;
  const totalCount = getExcludedCardManagementCount(exclusionState);
  const [tab, setTab] = useState('search');
  const [minOvr, setMinOvr] = useState(squadOvrRange.min);
  const [maxOvr, setMaxOvr] = useState(squadOvrRange.max);
  const validRange = Number.isInteger(minOvr) && Number.isInteger(maxOvr) && minOvr >= 45 && maxOvr <= 99 && minOvr <= maxOvr;
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [searchRetry, setSearchRetry] = useState(0);
  const [detailRetry, setDetailRetry] = useState(0);
  const [selected, setSelected] = useState([]);
  const cache = useRef(new Map());
  const [, refreshDetails] = useState(0);
  const panel = useRef(null);
  const input = useRef(null);
  const selectAll = useRef(null);
  const selectedIds = ids.filter(id => selected.includes(id));
  const idsKey = JSON.stringify(ids);
  const hasOvrRule = isSquadOvrRangeCustom(squadOvrRange);
  useEffect(() => {
    setMinOvr(squadOvrRange.min);
    setMaxOvr(squadOvrRange.max);
  }, [squadOvrRange.min, squadOvrRange.max]);

  function resetOvrRange() {
    change(() => {
      excludedCardVersionsStore.setSquadOvrRange({ min: 45, max: 99 });
      setMinOvr(45);
      setMaxOvr(99);
    }, 'OVR 범위를 초기화했습니다.');
  }

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    input.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    setSelected(previous => previous.filter(id => ids.includes(id)));
  }, [idsKey]);

  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = selectedIds.length > 0 && selectedIds.length < ids.length;
  }, [selectedIds.length, ids.length, tab]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setSearchError('');
    if (!keyword.trim()) {
      setRows([]); setHasMore(false); setSearchLoading(false);
      return () => { active = false; controller.abort(); };
    }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const cards = await searchExclusionCards(supabase, {
          keyword, offset: page * EXCLUSION_SEARCH_PAGE_SIZE, signal: controller.signal,
        });
        if (!active) return;
        cards.forEach(card => cache.current.set(String(card.id), card));
        setRows(previous => page === 0 ? cards : [...new Map([...previous, ...cards].map(card => [String(card.id), card])).values()]);
        setHasMore(cards.length === EXCLUSION_SEARCH_PAGE_SIZE);
      } catch (error) {
        if (active) setSearchError(error.message || '카드 검색에 실패했습니다.');
      } finally {
        if (active) setSearchLoading(false);
      }
    }, page === 0 ? 300 : 0);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [keyword, page, supabase, searchRetry]);

  useEffect(() => {
    if (tab !== 'excluded') return;
    let active = true;
    const controller = new AbortController();
    const missing = ids.filter(id => !cache.current.has(id));
    setDetailError('');
    setDetailLoading(missing.length > 0);
    if (missing.length) fetchExcludedCardDetails(supabase, missing, controller.signal).then(cards => {
      if (!active) return;
      missing.forEach(id => cache.current.set(id, null));
      cards.forEach(card => cache.current.set(String(card.id), card));
      refreshDetails(value => value + 1);
    }).catch(error => {
      if (active) setDetailError(error.message || '카드 정보를 불러오지 못했습니다.');
    }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [tab, idsKey, supabase, detailRetry]);

  function change(action, message) {
    try { action(); setActionError(''); setNotice(message); }
    catch (error) { setActionError(error.message); }
  }

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  function applyOvrRange(min = minOvr, max = maxOvr) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 45 || max > 99 || min > max) return;
    change(() => {
      excludedCardVersionsStore.setSquadOvrRange({ min, max });
      setMinOvr(min);
      setMaxOvr(max);
    }, '자동 생성 OVR 범위를 변경했습니다.');
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    if (event.key !== 'Tab') return;
    const focusable = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')]
      .filter(node => !node.closest('[hidden]') && node.tabIndex !== -1);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return createPortal(<div className="modal exclusion-manager-modal" onKeyDown={handleKeyDown}>
    <div className="modal-backdrop" onClick={onClose} />
    <section ref={panel} className="modal-panel exclusion-manager-panel" role="dialog" aria-modal="true" aria-labelledby="exclusion-manager-title">
      <header className="modal-header">
        <div><p className="eyebrow">AUTO BUILD</p><h2 id="exclusion-manager-title">제외 카드 관리</h2></div>
        <button className="modal-close" type="button" aria-label="제외 카드 관리 닫기" onClick={onClose}>×</button>
      </header>
      <p className="exclusion-manager-help">선택한 카드 버전만 제외합니다. 같은 선수의 다른 시즌 카드는 후보로 남습니다.</p>
      <div className="exclusion-manager-tabs" role="tablist" aria-label="제외 카드 관리 탭">
        {[['search', '카드 검색 및 제외'], ['excluded', `현재 제외 및 범위 설정 (${totalCount}개)`]].map(([key, label]) =>
          <button key={key} id={`exclusion-tab-${key}`} role="tab" type="button" aria-selected={tab === key}
            aria-controls={`exclusion-panel-${key}`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)}
            onKeyDown={event => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next = event.key === 'Home' ? 'search' : event.key === 'End' ? 'excluded' : tab === 'search' ? 'excluded' : 'search';
                setTab(next); document.getElementById(`exclusion-tab-${next}`).focus();
              }
            }}>{label}</button>)}
      </div>
      <div id="exclusion-panel-search" role="tabpanel" aria-labelledby="exclusion-tab-search" hidden={tab !== 'search'}>
        <label className="exclusion-search-label" htmlFor="exclusion-card-search">선수 / 카드 검색</label>
        <input ref={input} id="exclusion-card-search" className="exclusion-card-search" type="search" autoComplete="off"
          placeholder="선수 이름 또는 전체 이름 입력" value={keyword} onChange={event => {
            setKeyword(event.target.value); setPage(0); setRows([]); setHasMore(false);
          }} />
        <div className="exclusion-card-list" aria-busy={searchLoading}>
          {!keyword.trim() && <p>이름을 검색해 제외할 카드를 찾아보세요.</p>}
          {rows.map(card => {
            const id = String(card.id), banned = ids.includes(id);
            return <div className="exclusion-card-row" key={id}>
              <CardSummary card={card} id={id} />
              <button type="button" className="exclusion-toggle" aria-pressed={banned}
                aria-label={`${exclusionCardLabel(card)} ${banned ? '제외 해제' : '제외하기'}`}
                onClick={() => change(() => banned ? excludedCardVersionsStore.unban(id) : excludedCardVersionsStore.ban(id, exclusionCardLabel(card)),
                  banned ? '카드의 제외를 해제했습니다.' : '카드를 제외했습니다.')}>{banned ? '✅ 제외됨' : '🚫 제외하기'}</button>
            </div>;
          })}
          {searchLoading && <p role="status">카드를 검색하고 있습니다…</p>}
          {!searchLoading && !searchError && keyword.trim() && !rows.length && <p>검색 결과가 없습니다.</p>}
          {searchError && <p role="alert">{searchError} <button type="button" onClick={() => setSearchRetry(value => value + 1)}>다시 시도</button></p>}
          {hasMore && !searchError && <button type="button" className="exclusion-load-more" disabled={searchLoading} onClick={() => setPage(value => value + 1)}>더 보기</button>}
        </div>
        <fieldset className="exclusion-ovr">
          <legend>스쿼드 OVR 범위 설정</legend>
          <div className="exclusion-ovr-fields">
            {[['min', '최소 OVR', minOvr, setMinOvr], ['max', '최대 OVR', maxOvr, setMaxOvr]].map(([key, label, value, setValue]) =>
              <div key={key}>
                <label htmlFor={`exclusion-ovr-${key}`}>{label}</label>
                <input id={`exclusion-ovr-${key}`} type="number" min="45" max="99" step="1" value={value}
                  onChange={event => setValue(event.target.value === '' ? '' : Number(event.target.value))} />
                <input type="range" aria-label={`${label} 슬라이더`} min="45" max="99" step="1"
                  value={value === '' ? (key === 'min' ? 45 : 99) : value} onChange={event => {
                    const next = Number(event.target.value);
                    setValue(next);
                    if (key === 'min' && next > maxOvr) setMaxOvr(next);
                    if (key === 'max' && next < minOvr) setMinOvr(next);
                  }} />
              </div>)}
          </div>
          <div className="exclusion-ovr-chips">
            {[[45, 64, 'OVR 64 이하만 (브론즈)'], [45, 74, 'OVR 74 이하만 (실버 이하)'], [75, 99, 'OVR 75 이상만 (골드 이상)']].map(([min, max, label]) =>
              <button key={label} type="button" aria-pressed={squadOvrRange.min === min && squadOvrRange.max === max}
                onClick={() => applyOvrRange(min, max)}>{label}</button>)}
            <button type="button" onClick={resetOvrRange}>OVR 범위 초기화</button>
          </div>
          {!validRange && <p role="alert">45 ~ 99 사이의 정수를 입력하고, 최소 OVR을 최대 OVR 이하로 설정해 주세요.</p>}
          <button type="button" className="exclusion-ovr-submit" disabled={!validRange} onClick={() => applyOvrRange()}>
            해당 OVR 범위로 자동 완성 설정
          </button>
          <p>자동 생성 후보: OVR {squadOvrRange.min} ~ {squadOvrRange.max}. 새 범위 설정은 이전 범위를 대체합니다.</p>
        </fieldset>
      </div>
      <div id="exclusion-panel-excluded" role="tabpanel" aria-labelledby="exclusion-tab-excluded" hidden={tab !== 'excluded'}>
        {hasOvrRule && <div className="exclusion-ovr-rule" role="status">
          <strong>🎯 OVR {squadOvrRange.min} ~ {squadOvrRange.max}만 스쿼드에 포함</strong>
          <button type="button" aria-label="OVR 범위 설정 취소" onClick={resetOvrRange}>✕ 취소</button>
        </div>}
        <label className="exclusion-select-all"><input ref={selectAll} type="checkbox" disabled={!ids.length}
          checked={ids.length > 0 && selectedIds.length === ids.length} onChange={event => setSelected(event.target.checked ? [...ids] : [])} /> 전체 선택 / 해제</label>
        {detailLoading && <p role="status">제외된 카드 정보를 불러오고 있습니다…</p>}
        {detailError && <p role="alert">{detailError} <button type="button" onClick={() => setDetailRetry(value => value + 1)}>다시 시도</button></p>}
        <div id="excluded-card-versions-list" className="exclusion-card-list">
          {!ids.length && <p>{hasOvrRule ? '개별 제외된 카드는 없습니다.' : '제외된 카드가 없습니다.'}</p>}
          {ids.map(id => <div className="exclusion-card-row" key={id}>
            <input type="checkbox" aria-label={`${names[id]} 선택`} checked={selectedIds.includes(id)} onChange={event =>
              setSelected(previous => event.target.checked ? [...previous, id] : previous.filter(value => value !== id))} />
            <CardSummary card={cache.current.get(id)} id={id} fallbackName={names[id]} />
          </div>)}
        </div>
        <footer className="exclusion-bulk-actions">
          <span>{selectedIds.length}개 선택</span>
          <button type="button" disabled={!selectedIds.length} onClick={() => change(() => {
            excludedCardVersionsStore.unbanMany(selectedIds); setSelected([]);
            document.getElementById('exclusion-tab-excluded').focus();
          }, '선택한 카드의 제외를 해제했습니다.')}>선택 항목 해제</button>
          <button type="button" className="exclusion-clear" disabled={!ids.length} onClick={() => change(() => {
            excludedCardVersionsStore.clear(); setSelected([]);
            document.getElementById('exclusion-tab-excluded').focus();
          }, '제외 목록을 초기화했습니다.')}>전체 초기화</button>
        </footer>
      </div>
      {actionError && <p className="exclusion-action-message" role="alert">{actionError}</p>}
      {notice && <p className="exclusion-action-message exclusion-toast" role="status">{notice}</p>}
    </section>
  </div>, document.body);
}

export function ExcludedCardVersionsManager({ supabase }) {
  const exclusionState = useSyncExternalStore(excludedCardVersionsStore.subscribe, excludedCardVersionsStore.getState);
  const totalCount = getExcludedCardManagementCount(exclusionState);
  const [open, setOpen] = useState(false);
  return <section className="excluded-card-versions-manager">
    <button type="button" className="excluded-card-versions-toggle" aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen(true)}>🚫 제외 카드 관리 ({totalCount})</button>
    {open && <ExclusionDialog supabase={supabase} onClose={() => setOpen(false)} />}
  </section>;
}

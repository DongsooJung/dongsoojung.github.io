(() => {
  'use strict';

  // The legacy Supabase KPI project is being retired. The execution board
  // already persists editable KPI values in localStorage, so keep that path
  // authoritative until KPI data is migrated to canonical production
  // (inftexpcnfinglwlrvsj) and verified there.
  document.documentElement.dataset.kpiSync = 'local';

  const footer = document.querySelector('.footer span:last-child');
  if (footer) {
    footer.textContent = 'KPI는 현재 실행 보드의 로컬 저장값을 사용합니다. 중앙 동기화는 Production 이관 후 재개됩니다.';
  }
})();

(() => {
  'use strict';

  const SUPABASE_URL = 'https://flxntafmvcdhpagzrvii.supabase.co';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZseG50YWZtdmNkaHBhZ3pydmlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMzc2NjgsImV4cCI6MjA3NzkxMzY2OH0.JOqS4I18z1al-omPSgRQor-eUx2Qd-IhT-6aAAtdDl8';
  const keyMap = {
    revenue: 'revenue',
    proposals: 'proposals',
    products: 'products',
    data: 'data_products',
    automation: 'automations'
  };

  async function loadKpis() {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_execution_kpis`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: '{}',
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`kpi_rpc_${response.status}`);
      const rows = await response.json();
      const byKey = Object.fromEntries(rows.map(row => [row.metric_key, row]));

      document.querySelectorAll('[data-kpi]').forEach(input => {
        const metric = byKey[keyMap[input.dataset.kpi]];
        if (!metric) return;
        input.value = metric.current_value;
        input.readOnly = true;
        input.setAttribute('aria-label', `${metric.label}: ${metric.current_value} / ${metric.target_value}`);
        input.title = `자동 집계 · ${metric.source} · ${new Date(metric.verified_at).toLocaleString('ko-KR')}`;
      });

      const footer = document.querySelector('.footer span:last-child');
      if (footer) footer.textContent = 'KPI는 Supabase 중앙 지표에서 자동 동기화됩니다.';
      document.documentElement.dataset.kpiSync = 'ready';
    } catch (error) {
      console.error('Execution KPI sync failed:', error);
      document.documentElement.dataset.kpiSync = 'fallback';
    }
  }

  loadKpis();
})();

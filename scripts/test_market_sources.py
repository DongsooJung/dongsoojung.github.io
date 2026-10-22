"""Source failure, observation grain, and rounding regressions; no network."""
import importlib.util
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('market_collector', Path(__file__).parents[1] / 'exchange-rate/fetch_markets.py')
market = importlib.util.module_from_spec(spec)
spec.loader.exec_module(market)


class MarketSources(unittest.TestCase):
    def test_all_source_failures_preserve_snapshot_bytes_and_dates(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'market_data.json'
            original = b'{"updatedAt":"2026-09-01","series":[]}\n'
            target.write_bytes(original)
            with patch.object(market, 'DATA_PATH', target), patch.object(market, 'fetch_dram', side_effect=TimeoutError), patch.object(market, 'fetch_brent', side_effect=TimeoutError), patch.object(market, 'fetch_world_bank', side_effect=TimeoutError):
                self.assertEqual(market.main(), 1)
            self.assertEqual(target.read_bytes(), original)
            self.assertFalse((Path(folder) / 'market-fallback.js').exists())

    def test_world_bank_ignores_empty_invalid_future_rows(self):
        year = date.today().year
        class Sheet:
            def iter_rows(self, min_row, **kwargs):
                if min_row == 5:
                    return iter([['Date', 'Natural gas, US', 'Copper', 'Gold', 'Crude oil, Brent']])
                return iter([[f'{year}M01', 3., 100., 50., 70.], [f'{year}M02', None, None, None, None], [f'{year}M03', float('nan'), True, None, float('inf')], [f'{year}M13', 99., 99., 99., 99.], [f'{year+1}M01', 999., 999., 999., 999.]])
            def __getitem__(self, key):
                return type('Cell', (), {'value': 'Updated on October 02, 2026'})()
        with patch.object(market, 'download_bytes', return_value=b'x'), patch('openpyxl.load_workbook', return_value={'Monthly Prices': Sheet()}) as load:
            values, latest, publication = market.fetch_world_bank()
        self.assertEqual(latest, f'{year}-01')
        self.assertEqual(values['brentUsdPerBbl'][year], [70.])
        self.assertEqual(publication, 'October 02, 2026')
        self.assertEqual(load.call_args.kwargs, {'read_only': True, 'data_only': True})

    def test_monthly_fallback_keeps_source_and_observation_units(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'market_data.json'
            values = {k: {2026: [v] * 9} for k, v in {'brentUsdPerBbl':94., 'goldUsdPerOz':4552., 'copperUsdPerMt':13431.22, 'gasUsdPerMmbtu':3.52}.items()}
            with patch.object(market, 'DATA_PATH', target), patch.object(market, 'fetch_dram', return_value=({2026: [3.836] * 9}, '2026-09-01')), patch.object(market, 'fetch_brent', side_effect=TimeoutError), patch.object(market, 'fetch_world_bank', return_value=(values, '2026-09', 'October 02, 2026')):
                self.assertEqual(market.main(), 0)
            payload = json.loads(target.read_text())
        self.assertEqual(payload['series'][0]['brentObservations'], 9)
        self.assertEqual(payload['series'][0]['brentObservationUnit'], 'months')
        self.assertEqual(payload['series'][0]['brentSource'], 'worldbank')
        self.assertEqual(payload['sources']['brent']['frequency'], 'monthly')
        self.assertEqual(payload['sources']['commodities']['observedAt'], '2026-09')
        self.assertEqual(payload['collectionFailures'], {'brent':'TimeoutError'})

    def test_decimal_half_even_boundary(self):
        self.assertEqual(market.rounded_mean([3.35, 3.36], 2), 3.36)
        self.assertEqual(market.rounded_mean([3.34, 3.35], 2), 3.34)

    def test_partial_failure_preserves_retained_brent_provenance(self):
        old_source = {'name':'FRED/EIA DCOILBRENTEU', 'url':market.BRENT_URL, 'frequency':'daily', 'metric':'daily mean', 'observedAt':'2026-09-30', 'collectedAt':'2026-10-01T00:00:00Z'}
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'market_data.json'
            target.write_text(json.dumps({'sources':{'brent':old_source}, 'series':[{'year':2026, 'partial':True, 'brentUsdPerBbl':90., 'brentObservations':20, 'brentObservationUnit':'days', 'brentSource':'fred'}]}))
            with patch.object(market, 'DATA_PATH', target), patch.object(market, 'fetch_dram', return_value=({2026:[3.]}, '2026-09-01')), patch.object(market, 'fetch_brent', side_effect=TimeoutError), patch.object(market, 'fetch_world_bank', side_effect=TimeoutError):
                self.assertEqual(market.main(), 0)
            payload = json.loads(target.read_text())
        self.assertEqual(payload['sources']['brent'], {**old_source, 'state':'retained'})
        self.assertEqual(payload['series'][0]['brentSource'], 'fred')
        self.assertEqual(payload['series'][0]['brentObservationUnit'], 'days')
        self.assertEqual(payload['series'][0]['brentState'], 'retained')


if __name__ == '__main__':
    unittest.main()

import math
import unittest

from lineage import explain, shapley_game


def row(id, island, fitness, parents='', operator='trial', **extra):
    return dict(individual_id=id, island_id=island, fitness=fitness,
                parent_ids=parents, operator=operator, **extra)


class LineageTests(unittest.TestCase):
    def test_complementary_islands_share_joint_gain_and_dummy_is_zero(self):
        game = shapley_game(['A', 'B', 'dummy'], [(3, 12)], seed=7)
        self.assertEqual([p['value'] for p in game['players']], [6, 6, 0])
        self.assertEqual(game['empty_value'], 0)
        self.assertEqual(game['full_value'], 12)
        self.assertAlmostEqual(game['efficiency_error'], 0)

    def test_full_parent_lineage_not_any_parent_path(self):
        rows = [row('a', 0, 100, operator='init'), row('b', 1, 100, operator='init'),
                row('c', 1, 80, 'a', 'migration_arrival', origin_island=0, origin_individual_id='a'),
                row('d', 1, 10, 'b;c')]
        result = explain(rows, maximising=False, run_id='test')
        self.assertEqual([p['value'] for p in result['games']['islands']['players']], [45, 45])
        self.assertEqual(result['games']['routes']['full_value'], 90)
        self.assertEqual(result['games']['routes']['empty_value'], 0)
        self.assertEqual(result['coverage']['supported'], 4)

    def test_migration_game_only_allocates_gain_beyond_local_only(self):
        rows = [row('a', 0, 100, operator='init'), row('b', 1, 100, operator='init'),
                row('l', 0, 60, 'a'), row('m', 1, 60, 'l', 'migration_arrival', origin_island=0, origin_individual_id='l'),
                row('w', 1, 20, 'b;m')]
        result = explain(rows, maximising=False, run_id='test')
        game = result['games']['routes']
        self.assertEqual(game['empty_value'], 40)
        self.assertEqual(game['full_value'], 80)
        self.assertEqual(game['players'][0]['value'], 40)

    def test_maximisation_and_input_order_independence(self):
        rows = [row('a', 0, -10, operator='init'), row('b', 0, -3, 'a')]
        a = explain(rows, maximising=True, run_id='test')
        b = explain(list(reversed(rows)), maximising=True, run_id='test')
        self.assertEqual(a, b)
        self.assertEqual(a['baseline_fitness'], -10)
        self.assertEqual(a['games']['islands']['full_value'], 7)

    def test_missing_cycle_and_unlogged_parentage_are_excluded(self):
        rows = [row('a', 0, 100, operator='init'), row('b', 0, 1, 'absent'),
                row('c', 0, 0, 'b'), row('d', 0, -1),
                row('e', 0, -2, 'f'), row('f', 0, -3, 'e')]
        r = explain(rows, maximising=False, run_id='test')
        self.assertEqual(r['coverage']['supported'], 1)
        self.assertEqual(r['coverage']['excluded'], 5)
        self.assertEqual(r['games']['islands']['full_value'], 0)
        self.assertEqual(r['observed_best_fitness'], -3)
        self.assertEqual(r['supported_best_fitness'], 100)

    def test_retained_migrant_provenance_cannot_replace_pso_parentage(self):
        rows = [row('a', 0, 100, operator='init'), row('b', 1, 100, operator='init'),
                row('m', 1, 100, 'a', 'migration_arrival', origin_island=0, origin_individual_id='a'),
                row('p', 1, 0, operator='pso_move', origin_island=0, origin_individual_id='a')]
        result = explain(rows, maximising=False, run_id='test')
        self.assertEqual(result['coverage']['supported'], 3)
        self.assertEqual(result['games']['islands']['full_value'], 0)
        self.assertEqual(result['coverage']['excluded'], 1)

    def test_non_arrival_origin_fields_do_not_invent_migration_dependencies(self):
        rows = [row('a', 0, 100, operator='init'), row('b', 1, 100, operator='init'),
                row('p', 1, 0, 'b', 'pso_move', origin_island=0, origin_individual_id='a')]
        result = explain(rows, maximising=False, run_id='test')
        self.assertEqual(result['games']['routes']['players'], [])
        self.assertEqual(result['games']['routes']['empty_value'], 100)

    def test_duplicate_identity_nonfinite_and_missing_initialisation_fail(self):
        for rows in ([row('a', 0, 1, operator='init')]*2,
                     [row('a', 0, 100, operator='init'), row('a', 1, 100, operator='init'), row('b', 1, 1, 'a')],
                     [row('a', 0, math.nan, operator='init')], [row('a', 0, 1)]):
            with self.assertRaises(ValueError):
                explain(rows, maximising=False, run_id='test')

    def test_sampled_game_reproducible_efficient_and_reports_standard_error(self):
        a = shapley_game([str(i) for i in range(11)], [(1, 3), (3, 9)], seed=23)
        b = shapley_game([str(i) for i in range(11)], [(1, 3), (3, 9)], seed=23)
        self.assertEqual(a, b)
        self.assertEqual(a['method'], 'permutation-sampling')
        self.assertAlmostEqual(sum(p['value'] for p in a['players']), 9)
        self.assertGreater(a['players'][0]['standard_error'], 0)
        self.assertTrue(all(p['value'] == 0 for p in a['players'][2:]))

    def test_no_routes_and_no_improvement_are_finite(self):
        result = explain([row('a', 0, 1, operator='init')], maximising=False, run_id='test')
        self.assertEqual(result['games']['routes']['players'], [])
        self.assertEqual(result['games']['islands']['players'][0]['share_percent'], 0)


if __name__ == '__main__':
    unittest.main()

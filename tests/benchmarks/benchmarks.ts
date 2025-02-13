import {testFramework, logPerfHeaders, logPerfResult} from 'js-reactivity-benchmark';
import {tc39SignalsProposalStage0} from './adapter';
import {writeFile} from 'fs/promises';

(async () => {
  logPerfHeaders();
  const results: {name: string; value: number; unit: string}[] = [];
  await testFramework({framework: tc39SignalsProposalStage0, testPullCounts: true}, (result) => {
    logPerfResult(result);
    results.push({name: result.test, value: result.time, unit: 'ms'});
  });
  await writeFile('benchmarks.json', JSON.stringify(results, null, ' '));
})();

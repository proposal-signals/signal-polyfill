import type {RunnerTestFile} from 'vitest';
import type {Reporter} from 'vitest/reporters';
import {writeFile} from 'fs/promises';

class JsonArrayReporter implements Reporter {
  async onFinished(files: RunnerTestFile[]): Promise<void> {
    const results: {
      name: string;
      unit: string;
      value: number;
    }[] = [];

    function processTasks(tasks: RunnerTestFile['tasks'], name: string) {
      for (const task of tasks) {
        if (task.type === 'suite') {
          processTasks(task.tasks, `${name} > ${task.name}`);
        } else {
          const value = task.result?.benchmark?.hz;
          if (value) {
            results.push({
              name: `${name} > ${task.name}`,
              unit: 'Hz',
              value,
            });
          }
        }
      }
    }

    for (const file of files) {
      processTasks(file.tasks, file.name);
    }

    await writeFile('benchmarks.json', JSON.stringify(results, null, ' '));
  }
}

export default JsonArrayReporter;

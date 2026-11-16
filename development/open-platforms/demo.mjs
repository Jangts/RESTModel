/** 可运行的终端 Demo：默认 Fetch 连接真实公开 REST API，不需要 Token。 */
import { dataOf, resourceOf, RequestError } from '../../packages/restmodel/dist/index.js';
import { platforms, platformClient } from './platforms.mjs';

async function run(key) {
  const platform = Object.hasOwn(platforms, key) ? platforms[key] : undefined;
  if (!platform) throw new Error(`Unknown platform: ${key}. Choose gitee or github.`);
  console.log(`\n${platform.name} — ${platform.owner}/${platform.repository}`);
  console.log(platform.note);
  const api = platformClient(key, {
    prepareRequest(request) {
      console.log(`→ ${request.method} ${request.url}`);
      return request;
    },
    observeResponse(response) {
      console.log(`← HTTP ${response.status}`);
    },
  });
  const collection = api[platform.collection].query(platform.query);
  console.log(`\n1. api.${platform.collection}.page(1, 2).list()`);
  const list = await collection.page(1, 2).list();
  console.table(
    list.items.map((item) => ({
      id: item.id,
      ...(platform.identity !== 'id' ? { [platform.identity]: item[platform.identity] } : {}),
      name: item.name ?? item.title ?? item.tag_name,
    })),
  );
  console.log('Pagination:', list.page, 'total:', list.total ?? 'unknown');
  const first = list.items[0];
  if (first) {
    console.log(
      `\n2. resourceOf(first).get() — identity: ${platform.identity}=${first[platform.identity]}`,
    );
    const member = await resourceOf(first).get();
    const value = dataOf(member);
    console.log(
      JSON.stringify(
        {
          id: value.id,
          ...(platform.identity !== 'id' ? { [platform.identity]: value[platform.identity] } : {}),
          name: value.name ?? value.title ?? value.tag_name,
          url: value.html_url,
        },
        null,
        2,
      ),
    );
  } else {
    console.log('The live collection is empty; there is no entity to read.');
  }
  console.log(`\n3. api.${platform.collection}.page(2, 2).list()`);
  const second = await collection.page(2, 2).list();
  console.log(
    second.items.length ? `${second.items.length} records` : 'The server returned an empty page.',
  );
  console.log('\n4. api.repository({ owner, repo }) — action with two named path parameters');
  const repository = await api.repository({ owner: platform.owner, repo: platform.repository });
  console.log(
    JSON.stringify(
      { id: repository.id, full_name: repository.full_name, url: repository.html_url },
      null,
      2,
    ),
  );
}

const [key = 'gitee', ...extra] = process.argv.slice(2);
if (key === '--help') {
  console.log(
    'Usage: pnpm demo [gitee|github]\nCommands: pnpm demo:gitee | pnpm demo:github | pnpm test:live',
  );
} else {
  try {
    if (extra.length) throw new Error('Unexpected arguments. Use pnpm demo --help.');
    await run(key);
  } catch (error) {
    const detail =
      error instanceof RequestError
        ? `${error.kind}${error.response ? ` (HTTP ${error.response.status})` : ''}${error.cause?.code ? `: ${error.cause.code}` : ''}`
        : error.message;
    console.error(`Demo failed: ${detail}`);
    process.exitCode = 1;
  }
}

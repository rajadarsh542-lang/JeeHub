import { readFile } from 'node:fs/promises';

export default {
  async redirects() {
    const release = JSON.parse(
      await readFile(new URL('./public/assets/bank-release.json', import.meta.url), 'utf8'),
    );
    if (!/^[a-f0-9]{40}$/.test(release.commit) || /^0+$/.test(release.commit)) {
      throw new Error('The question bank release needs a full Git commit SHA.');
    }
    return [{
      source: '/api/questions',
      destination: `https://raw.githubusercontent.com/rajadarsh542-lang/JeeHub/${release.commit}/bank/questions.json`,
      permanent: false,
    }];
  },
  async rewrites() {
    return [
      { source: "/", destination: "/practice.html" },
      { source: "/practice/:id", destination: "/practice.html" },
    ];
  },
};

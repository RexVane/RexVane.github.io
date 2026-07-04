export interface GitHubRepo {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  fork: boolean;
  updated_at: string;
  pushed_at: string;
}

export const githubReposUrl = 'https://api.github.com/users/RexVane/repos?sort=updated&per_page=30';

const fallbackProjects: GitHubRepo[] = [
  {
    name: 'Wormhole',
    description:
      '基于 Python 标准库 socket 的 FTP 服务器(三种并发模型/FTPS/断点续传/chroot 隔离)+ 虫洞随机文件传输桌宠',
    html_url: 'https://github.com/RexVane/Wormhole',
    language: 'Python',
    stargazers_count: 1,
    fork: false,
    updated_at: '2026-07-03T04:18:49Z',
    pushed_at: '2026-07-03T04:18:45Z',
  },
];

export function sortProjects(repos: GitHubRepo[]) {
  return repos
    .filter((repo) => !repo.fork)
    .sort((a, b) => {
      const dateA = new Date(a.pushed_at || a.updated_at).valueOf();
      const dateB = new Date(b.pushed_at || b.updated_at).valueOf();
      return dateB - dateA;
    });
}

let cache: GitHubRepo[] | null = null;

// 构建时拉一次 GitHub 仓库列表；zh/en 两个页面共享缓存，失败时退回静态数据。
export async function loadBuildTimeProjects(): Promise<GitHubRepo[]> {
  if (cache) return cache;

  try {
    const headers: HeadersInit = {
      Accept: 'application/vnd.github+json',
    };

    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    const response = await fetch(githubReposUrl, { headers });

    if (!response.ok) {
      throw new Error(`GitHub API ${response.status}`);
    }

    cache = sortProjects((await response.json()) as GitHubRepo[]);
  } catch (error) {
    console.warn('Falling back to static project data:', error);
    cache = fallbackProjects;
  }

  return cache;
}

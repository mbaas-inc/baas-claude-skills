/**
 * useBoard — 게시판 CRUD 훅. host React 사용(JSX 미사용).
 * 상태(posts/post/loading/error) + 동작. board_id 는 호출부가 넘긴다.
 */
import { getReact } from "./host";
import {
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
} from "../core/board";
import type { BoardPost, PostListResult, PostListOptions, PostCreateInput } from "../core/board";

export function useBoard() {
  const React = getReact();
  const [posts, setPosts] = React.useState<PostListResult | null>(null);
  const [post, setPost] = React.useState<BoardPost | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e as Error);
      return null;
    } finally {
      setLoading(false);
    }
  }

  const fetchPosts = React.useCallback(
    (boardId: string, options: PostListOptions = {}) =>
      run(async () => {
        const data = await listPosts(boardId, options);
        setPosts(data);
        return data;
      }),
    []
  );

  const fetchPost = React.useCallback(
    (postId: string) =>
      run(async () => {
        const data = await getPost(postId);
        setPost(data);
        return data;
      }),
    []
  );

  const submitPost = React.useCallback(
    (boardId: string, data: PostCreateInput) => run(() => createPost(boardId, data)),
    []
  );

  const editPost = React.useCallback(
    (postId: string, data: Partial<PostCreateInput>) => run(() => updatePost(postId, data)),
    []
  );

  const removePost = React.useCallback((postId: string) => run(() => deletePost(postId)), []);

  return { posts, post, loading, error, fetchPosts, fetchPost, submitPost, editPost, removePost };
}

/** Pinia 请求状态封装；核心不感知 Vue 生命周期，迟到结果不能覆盖新状态。 */
import { defineStore } from 'pinia';
import { onScopeDispose, shallowRef, ref } from 'vue';
/**
 * 声明共享请求状态 Store，调用方用 loader 接入公开资源调用。
 * @param id 唯一 Pinia Store ID。
 * @param loader 接收输入及本次 signal；应将 signal 传给 ref.with。
 * @returns Pinia useStore，提供 data/error/pending/run/cancel/subscribe。
 * @throws Error 已销毁 Store 不能再次执行。
 */
export function defineResourceStore<TInput, TData>(
  id: string,
  loader: (input: TInput, signal: AbortSignal) => Promise<TData>,
) {
  return defineStore(id, () => {
    const data = shallowRef<TData>();
    const error = shallowRef<unknown>();
    const pending = ref(false);
    let generation = 0;
    let controller: AbortController | undefined;
    let disposed = false;
    let subscribers = 0;
    const cancel = () => {
      generation++;
      controller?.abort();
      controller = undefined;
      pending.value = false;
    };
    const run = async (input: TInput): Promise<TData> => {
      if (disposed) throw new Error('Resource store disposed');
      cancel();
      const current = generation;
      const active = new AbortController();
      controller = active;
      pending.value = true;
      error.value = undefined;
      try {
        const result = await loader(input, active.signal);
        if (!disposed && current === generation) data.value = result;
        return result;
      } catch (cause) {
        if (!disposed && current === generation) error.value = cause;
        throw cause;
      } finally {
        if (current === generation) {
          pending.value = false;
          controller = undefined;
        }
      }
    };
    const subscribe = () => {
      if (disposed) throw new Error('Resource store disposed');
      subscribers++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        subscribers--;
        if (subscribers === 0) cancel();
      };
    };
    onScopeDispose(() => {
      disposed = true;
      cancel();
    });
    return { data, error, pending, run, cancel, subscribe };
  });
}

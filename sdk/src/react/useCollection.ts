/**
 * useCollection — 동적 컬렉션 레코드 CRUD 훅 (이슈 #608). host React 사용(JSX 미사용).
 * 상태(records/record/loading/error) + 동작. collection name 은 호출부가 넘긴다.
 * UI 는 앱이 요구에 맞춰 설계하고, 이 훅으로 데이터만 연결한다(범용 렌더 아님).
 */
import { getReact } from "./host";
import {
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  listPublicRecords,
  getPublicRecord,
} from "../core/collection";
import type { DynRecord, RecordListResult, RecordListOptions } from "../core/collection";

export function useCollection() {
  const React = getReact();
  const [records, setRecords] = React.useState<RecordListResult | null>(null);
  const [record, setRecord] = React.useState<DynRecord | null>(null);
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

  const fetchRecords = React.useCallback(
    (name: string, options: RecordListOptions = {}) =>
      run(async () => {
        const data = await listRecords(name, options);
        setRecords(data);
        return data;
      }),
    []
  );

  const fetchPublicRecords = React.useCallback(
    (name: string, options: RecordListOptions = {}) =>
      run(async () => {
        const data = await listPublicRecords(name, options);
        setRecords(data);
        return data;
      }),
    []
  );

  const fetchRecord = React.useCallback(
    (name: string, recordId: string, isPublic = false) =>
      run(async () => {
        const data = isPublic ? await getPublicRecord(name, recordId) : await getRecord(name, recordId);
        setRecord(data);
        return data;
      }),
    []
  );

  const submitRecord = React.useCallback(
    (name: string, data: Record<string, unknown>) => run(() => createRecord(name, data)),
    []
  );

  const editRecord = React.useCallback(
    (name: string, recordId: string, data: Record<string, unknown>) =>
      run(() => updateRecord(name, recordId, data)),
    []
  );

  const removeRecord = React.useCallback(
    (name: string, recordId: string) => run(() => deleteRecord(name, recordId)),
    []
  );

  return {
    records,
    record,
    loading,
    error,
    fetchRecords,
    fetchPublicRecords,
    fetchRecord,
    submitRecord,
    editRecord,
    removeRecord,
  };
}

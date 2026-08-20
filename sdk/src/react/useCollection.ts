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
  aggregateRecords,
  incrementRecord,
  restoreRecord,
  batchRecords,
  runTransaction,
} from "../core/collection";
import type {
  AggregateOp,
  AggregateResult,
  BatchInput,
  DynRecord,
  DynRecordDetail,
  FieldDefinition,
  RecordFilter,
  RecordListOptions,
  RecordListResult,
  TxnOperation,
} from "../core/collection";

export function useCollection() {
  const React = getReact();
  const [records, setRecords] = React.useState<RecordListResult | null>(null);
  const [record, setRecord] = React.useState<DynRecordDetail | null>(null);
  // 렌더에 필요한 스키마 — includeFields 로 받은 값을 여기 모아 둔다(목록·단건 어느 쪽이든).
  const [fields, setFields] = React.useState<FieldDefinition[] | null>(null);
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
        if (data.fields) setFields(data.fields);
        return data;
      }),
    []
  );

  /** @deprecated `fetchRecords` 와 동일하다 — 공개/회원 경로가 하나로 합쳐졌다. */
  const fetchPublicRecords = fetchRecords;

  // isPublic 은 경로 통합으로 무의미해졌다. 인자를 남겨 호출부 호환만 유지한다.
  const fetchRecord = React.useCallback(
    (name: string, recordId: string, options: { includeFields?: boolean } = {}) =>
      run(async () => {
        const data = await getRecord(name, recordId, options);
        setRecord(data);
        if (data.fields) setFields(data.fields);
        return data;
      }),
    []
  );

  const submitRecord = React.useCallback(
    (name: string, data: Record<string, unknown>, options: { clientTxnId?: string } = {}) =>
      run(() => createRecord(name, data, options)),
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

  const restore = React.useCallback(
    (name: string, recordId: string) => run(() => restoreRecord(name, recordId)),
    []
  );

  const increment = React.useCallback(
    (name: string, recordId: string, field: string, by = 1) =>
      run(() => incrementRecord(name, recordId, field, by)),
    []
  );

  const aggregate = React.useCallback(
    (
      name: string,
      op: AggregateOp,
      options: { field?: string; groupBy?: string; filter?: RecordFilter; or?: RecordFilter } = {}
    ): Promise<AggregateResult | null> => run(() => aggregateRecords(name, op, options)),
    []
  );

  const batch = React.useCallback(
    (name: string, input: BatchInput) => run(() => batchRecords(name, input)),
    []
  );

  const transaction = React.useCallback(
    (operations: TxnOperation[]) => run(() => runTransaction(operations)),
    []
  );

  return {
    records,
    record,
    fields,
    loading,
    error,
    fetchRecords,
    fetchPublicRecords,
    fetchRecord,
    submitRecord,
    editRecord,
    removeRecord,
    restore,
    increment,
    aggregate,
    batch,
    transaction,
  };
}

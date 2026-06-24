import { useState } from 'react';
import { Filter, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import type { Filters } from '../../../types/adminTypes';
import { BRAND } from '../../../types/adminTypes';

interface GlobalFiltersProps {
  filters: Filters;
  onApply: (f: Filters) => void;
  onReset: () => void;
  optionOverrides?: { cohorts?: string[]; colleges?: string[]; states?: string[]; programs?: string[] };
}

export const DEFAULT_FILTERS: Filters = {
  cohorts: [],
  colleges: [],
  states: [],
  programs: [],
  dateFrom: '',
  dateTo: '',
  attendanceMin: 0,
  attendanceMax: 100,
  assignmentMin: 0,
  assignmentMax: 100,
  quizMin: 0,
  quizMax: 100,
  engagementMin: 0,
  engagementMax: 100,
};

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (val: string) => {
    if (selected.includes(val)) onChange(selected.filter(s => s !== val));
    else onChange([...selected, val]);
  };
  return (
    <div style={{ position: 'relative' }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.text, marginBottom: 6, display: 'block' }}>
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '8px 12px',
          border: `1px solid ${BRAND.border}`,
          borderRadius: 8,
          background: BRAND.card,
          fontSize: 13,
          color: selected.length > 0 ? BRAND.text : BRAND.textLight,
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>
          {selected.length === 0
            ? `All ${label.toLowerCase()}`
            : `${selected.length} selected`}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: BRAND.card,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
            zIndex: 20,
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {options.map(opt => (
            <label
              key={opt}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: 13,
                color: BRAND.text,
              }}
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function RangeInput({
  label,
  min,
  max,
  onChangeMin,
  onChangeMax,
}: {
  label: string;
  min: number;
  max: number;
  onChangeMin: (v: number) => void;
  onChangeMax: (v: number) => void;
}) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.text, marginBottom: 6, display: 'block' }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          min={0}
          max={100}
          value={min}
          onChange={e => onChangeMin(Number(e.target.value))}
          style={{
            width: '100%',
            padding: '8px 10px',
            border: `1px solid ${BRAND.border}`,
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        />
        <span style={{ color: BRAND.textLight, fontSize: 12 }}>to</span>
        <input
          type="number"
          min={0}
          max={100}
          value={max}
          onChange={e => onChangeMax(Number(e.target.value))}
          style={{
            width: '100%',
            padding: '8px 10px',
            border: `1px solid ${BRAND.border}`,
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        />
      </div>
    </div>
  );
}

export default function GlobalFilters({ filters, onApply, onReset, optionOverrides }: GlobalFiltersProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>(filters);
  const cohortOpts  = optionOverrides?.cohorts  ?? [];
  const collegeOpts = optionOverrides?.colleges ?? [];
  const stateOpts   = optionOverrides?.states   ?? [];
  const programOpts = optionOverrides?.programs ?? [];

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div
      style={{
        background: BRAND.card,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 12,
        marginBottom: 24,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: BRAND.text, fontWeight: 700, fontSize: 14 }}>
          <Filter size={16} /> Global Filters
        </span>
        {open ? <ChevronUp size={16} color={BRAND.textLight} /> : <ChevronDown size={16} color={BRAND.textLight} />}
      </button>

      {open && (
        <div style={{ padding: '4px 18px 18px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 14,
              marginBottom: 14,
            }}
          >
            <MultiSelect label="Cohort"   options={cohortOpts}  selected={draft.cohorts}  onChange={v => update('cohorts', v)} />
            <MultiSelect label="College"  options={collegeOpts} selected={draft.colleges} onChange={v => update('colleges', v)} />
            <MultiSelect label="State"    options={stateOpts}   selected={draft.states}   onChange={v => update('states', v)} />
            <MultiSelect label="Program"  options={programOpts} selected={draft.programs} onChange={v => update('programs', v)} />

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.text, marginBottom: 6, display: 'block' }}>
                Date From
              </label>
              <input
                type="date"
                value={draft.dateFrom}
                onChange={e => update('dateFrom', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: `1px solid ${BRAND.border}`,
                  borderRadius: 8,
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.text, marginBottom: 6, display: 'block' }}>
                Date To
              </label>
              <input
                type="date"
                value={draft.dateTo}
                onChange={e => update('dateTo', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: `1px solid ${BRAND.border}`,
                  borderRadius: 8,
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <RangeInput
              label="Attendance %"
              min={draft.attendanceMin}
              max={draft.attendanceMax}
              onChangeMin={v => update('attendanceMin', v)}
              onChangeMax={v => update('attendanceMax', v)}
            />
            <RangeInput
              label="Assignment %"
              min={draft.assignmentMin}
              max={draft.assignmentMax}
              onChangeMin={v => update('assignmentMin', v)}
              onChangeMax={v => update('assignmentMax', v)}
            />
            <RangeInput
              label="Quiz Score"
              min={draft.quizMin}
              max={draft.quizMax}
              onChangeMin={v => update('quizMin', v)}
              onChangeMax={v => update('quizMax', v)}
            />
            <RangeInput
              label="Engagement Score"
              min={draft.engagementMin}
              max={draft.engagementMax}
              onChangeMin={v => update('engagementMin', v)}
              onChangeMax={v => update('engagementMax', v)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              onClick={() => {
                setDraft(DEFAULT_FILTERS);
                onReset();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 14px',
                background: 'transparent',
                color: BRAND.textLight,
                border: `1px solid ${BRAND.border}`,
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <RotateCcw size={14} /> Reset
            </button>
            <button
              type="button"
              onClick={() => onApply(draft)}
              style={{
                padding: '9px 18px',
                background: BRAND.navy,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

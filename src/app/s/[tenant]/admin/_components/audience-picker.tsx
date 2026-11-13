// Who can see an item, and which groups it is for. Empty groups = whole school.
export const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Everyone (public)', hint: 'Anyone who opens the portal, signed in or not.' },
  { value: 'families', label: 'Families (signed in)', hint: 'Approved families only. With groups ticked, only families in those grades.' },
  { value: 'staff', label: 'Staff only', hint: 'Only signed-in staff.' },
] as const;

export const visibilityLabel = (v: string) => VISIBILITY_OPTIONS.find((o) => o.value === v)?.label ?? v;

export function VisibilitySelect({ value = 'public' }: { value?: string }) {
  return (
    <div className="field">
      <label htmlFor="visibility">Who can see it</label>
      <select id="visibility" name="visibility" defaultValue={value}>
        {VISIBILITY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="hint">
        Public items with groups ticked are still public; the groups only label and filter them. Choose &ldquo;Families&rdquo; to keep
        an item private to those grades.
      </span>
    </div>
  );
}

export function AudiencePicker({
  audiences,
  selected,
  legend = 'Which groups is it for?',
  visibility,
}: {
  audiences: { id: string; name: string }[];
  selected: string[];
  legend?: string;
  /** Current visibility; omit to hide the selector (e.g. bulk import). */
  visibility?: string;
}) {
  return (
    <>
      {visibility !== undefined && <VisibilitySelect value={visibility} />}
      <fieldset className="field">
        <legend>{legend}</legend>
        <span className="hint">Leave everything unchecked for the whole school.</span>
        <div className="check-grid">
          {audiences.map((x) => (
            <label key={x.id} className="check">
              <input type="checkbox" name="audienceIds" value={x.id} defaultChecked={selected.includes(x.id)} />
              {x.name}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

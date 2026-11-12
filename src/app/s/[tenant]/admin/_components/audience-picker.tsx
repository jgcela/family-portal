// Checkbox list of audiences. Empty selection = whole school.
export function AudiencePicker({ audiences, selected, legend = 'Who is it for?' }: { audiences: { id: string; name: string }[]; selected: string[]; legend?: string }) {
  return (
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
  );
}

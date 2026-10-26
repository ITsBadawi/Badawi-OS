import { uiText } from "../localization.ts";
import React, { useState } from "react";
import { useApp } from "./context.tsx";
export function WorkFileMetadata({
  project,
  path,
}: {
  project: any;
  path: string;
}) {
  const { data, act } = useApp();
  const saved = project.fileEntries?.find((e: any) => e.path === path);
  const [category, setCategory] = useState(saved?.category || "other"),
    [tags, setTags] = useState<string>((saved?.tags || []).join(", ")),
    [linked, setLinked] = useState<string[]>(saved?.linkedProjectIds || []);
  return (
    <section className="workspace-connect">
      <h3>{uiText("تصنيف الملف وربطه بالمشاريع")}</h3>
      <label className="field">
        {uiText("التصنيف")}
        <select
          aria-label={uiText("تصنيف الملف")}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="design">{uiText("تصميم")}</option>
          <option value="document">{uiText("مستند")}</option>
          <option value="asset">{uiText("أصل / وسائط")}</option>
          <option value="other">{uiText("أخرى")}</option>
        </select>
      </label>
      <label className="field">
        {uiText("وسوم مفصولة بفاصلة")}
        <input
          aria-label={uiText("وسوم الملف")}
          value={tags}
          maxLength={500}
          onChange={(e) => setTags(e.target.value)}
        />
      </label>
      <fieldset>
        <legend>{uiText("مشاريع مرتبطة — دون نسخ الملف")}</legend>
        {data.projects
          .filter((p) => p.kind !== "workfiles")
          .map((p) => (
            <label className="check-field" key={p.id}>
              <input
                type="checkbox"
                checked={linked.includes(p.id)}
                onChange={(e) =>
                  setLinked(
                    e.target.checked
                      ? [...linked, p.id]
                      : linked.filter((id) => id !== p.id),
                  )
                }
              />
              {p.name}
            </label>
          ))}
      </fieldset>
      <button
        className="button secondary"
        onClick={() =>
          void act(
            {
              op: "files.classify",
              projectId: project.id,
              path,
              category: category as any,
              tags: tags
                .split(/[,،]/)
                .map((t) => t.trim())
                .filter(Boolean),
              linkedProjectIds: linked,
            },
            uiText("حُفظ التصنيف والروابط دون تغيير الملف"),
          )
        }
      >
        {uiText("حفظ تصنيف الملف")}
      </button>
    </section>
  );
}

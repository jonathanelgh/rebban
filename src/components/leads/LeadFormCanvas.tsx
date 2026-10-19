"use client";

import React, { useState } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import {
  LEAD_FIELD_DRAG_TYPE,
  LEAD_FIELD_REORDER_TYPE,
  LEAD_FORM_FIELD_TYPES,
  fieldInputStyle,
  fieldLabelStyle,
  normalizeLeadFormTheme,
  parseCheckboxValues,
  serializeCheckboxValues,
  type LeadFormField,
  type LeadFormFieldType,
  type LeadFormSelection,
  type LeadFormTheme,
} from "@/lib/leads/forms";

type LeadFormCanvasProps = {
  name: string;
  fields: LeadFormField[];
  theme?: LeadFormTheme | null;
  mode: "preview" | "live";
  selection?: LeadFormSelection | null;
  onSelect?: (selection: LeadFormSelection | null) => void;
  values?: Record<string, string>;
  onChangeValue?: (id: string, value: string) => void;
  onSubmit?: (e: React.FormEvent) => void;
  submitting?: boolean;
  error?: string | null;
  doneMessage?: string | null;
  onReorderFields?: (fromId: string, toIndex: number) => void;
  onInsertFieldType?: (type: LeadFormFieldType, index: number) => void;
  onRemoveField?: (fieldId: string) => void;
  draggingFieldType?: LeadFormFieldType | null;
};

function selectionRing(active: boolean, editable: boolean): string {
  if (!editable) return "";
  return active
    ? "ring-2 ring-[#2563EB] ring-offset-2"
    : "hover:ring-2 hover:ring-[#2563EB]/35 hover:ring-offset-2 cursor-pointer";
}

function isFieldType(value: string): value is LeadFormFieldType {
  return (LEAD_FORM_FIELD_TYPES as readonly string[]).includes(value);
}

function PreviewShell({
  theme,
  field,
  children,
  tall,
}: {
  theme: ReturnType<typeof normalizeLeadFormTheme>;
  field: LeadFormField;
  children: React.ReactNode;
  tall?: boolean;
}) {
  return (
    <div
      className={`w-full border px-3.5 py-2.5 text-sm ${tall ? "min-h-[96px]" : ""}`}
      style={{
        ...fieldInputStyle(theme, field),
        borderWidth: 1,
        borderStyle: "solid",
        opacity: 0.85,
      }}
    >
      {children}
    </div>
  );
}

function DropLine({ active }: { active: boolean }) {
  return (
    <div
      className={`h-1 rounded-full transition-all ${
        active ? "bg-emerald-500 scale-y-125 my-1" : "bg-transparent my-0"
      }`}
    />
  );
}

export function LeadFormCanvas({
  name,
  fields,
  theme: themeProp,
  mode,
  selection,
  onSelect,
  values = {},
  onChangeValue,
  onSubmit,
  submitting,
  error,
  doneMessage,
  onReorderFields,
  onInsertFieldType,
  onRemoveField,
  draggingFieldType = null,
}: LeadFormCanvasProps) {
  const theme = normalizeLeadFormTheme(themeProp);
  const editable = mode === "preview";
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);

  const isSelected = (sel: LeadFormSelection) => {
    if (!selection) return false;
    if (selection.type !== sel.type) return false;
    if (selection.type === "field" && sel.type === "field") {
      return selection.fieldId === sel.fieldId;
    }
    return true;
  };

  function handleDropAt(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.stopPropagation();
    setDropIndex(null);

    const reorderId = e.dataTransfer.getData(LEAD_FIELD_REORDER_TYPE);
    if (reorderId && onReorderFields) {
      onReorderFields(reorderId, index);
      setDraggingFieldId(null);
      return;
    }

    const fieldType = e.dataTransfer.getData(LEAD_FIELD_DRAG_TYPE);
    if (fieldType && isFieldType(fieldType) && onInsertFieldType) {
      onInsertFieldType(fieldType, index);
    }
  }

  function allowDrop(e: React.DragEvent, index: number) {
    if (!editable) return;
    const types = Array.from(e.dataTransfer.types);
    if (
      types.includes(LEAD_FIELD_DRAG_TYPE) ||
      types.includes(LEAD_FIELD_REORDER_TYPE)
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = types.includes(LEAD_FIELD_REORDER_TYPE)
        ? "move"
        : "copy";
      setDropIndex(index);
    }
  }

  function renderFieldControl(field: LeadFormField) {
    const inputStyle = {
      ...fieldInputStyle(theme, field),
      borderWidth: 1,
      borderStyle: "solid" as const,
    };
    const options = field.options || [];

    if (field.type === "textarea") {
      if (editable) {
        return (
          <PreviewShell theme={theme} field={field} tall>
            {field.placeholder || " "}
          </PreviewShell>
        );
      }
      return (
        <textarea
          required={field.required}
          rows={4}
          placeholder={field.placeholder}
          value={values[field.id] || ""}
          onChange={(e) => onChangeValue?.(field.id, e.target.value)}
          className="w-full border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
          style={inputStyle}
        />
      );
    }

    if (field.type === "select") {
      if (editable) {
        return (
          <PreviewShell theme={theme} field={field}>
            {field.placeholder || "Select an option…"}
          </PreviewShell>
        );
      }
      return (
        <select
          required={field.required}
          value={values[field.id] || ""}
          onChange={(e) => onChangeValue?.(field.id, e.target.value)}
          className="w-full border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 bg-white"
          style={inputStyle}
        >
          <option value="">{field.placeholder || "Select an option…"}</option>
          {options.map((option) => (
            <option key={option.id} value={option.label}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === "radio") {
      if (editable) {
        return (
          <div className="space-y-2 pt-0.5">
            {options.map((option) => (
              <div
                key={option.id}
                className="flex items-center gap-2.5 text-sm text-gray-700"
              >
                <span
                  className="w-4 h-4 rounded-full border shrink-0"
                  style={{ borderColor: theme.inputBorder }}
                />
                {option.label}
              </div>
            ))}
          </div>
        );
      }
      return (
        <div className="space-y-2 pt-0.5" role="radiogroup">
          {options.map((option) => (
            <label
              key={option.id}
              className="flex items-center gap-2.5 text-sm text-gray-800 cursor-pointer"
            >
              <input
                type="radio"
                name={field.id}
                required={field.required}
                checked={(values[field.id] || "") === option.label}
                onChange={() => onChangeValue?.(field.id, option.label)}
                className="w-4 h-4"
                style={{ accentColor: theme.accentColor }}
              />
              {option.label}
            </label>
          ))}
        </div>
      );
    }

    if (field.type === "terms") {
      const termsUrl = field.termsUrl?.trim() || "";
      const termsLabel = field.termsLabel?.trim() || "Terms";
      const privacyUrl =
        field.privacyUrl?.trim() || field.linkUrl?.trim() || "";
      const privacyLabel =
        field.privacyLabel?.trim() ||
        field.linkLabel?.trim() ||
        "Privacy Policy";

      function renderLink(href: string, text: string) {
        if (!href) {
          return <span className="font-medium">{text}</span>;
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-2"
            style={{ color: theme.accentColor }}
            onClick={(e) => e.stopPropagation()}
          >
            {text}
          </a>
        );
      }

      const consentLabel = (
        <span
          className="text-sm leading-snug"
          style={fieldLabelStyle(theme, field)}
        >
          {field.label?.trim() || "I agree to the"}{" "}
          {renderLink(termsUrl, termsLabel)}
          {" and "}
          {renderLink(privacyUrl, privacyLabel)}
          {field.required ? (
            <span className="text-red-500 ml-0.5">*</span>
          ) : null}
        </span>
      );

      if (editable) {
        return (
          <div className="flex items-start gap-2.5 pt-0.5">
            <span
              className="mt-0.5 w-4 h-4 rounded border shrink-0"
              style={{ borderColor: theme.inputBorder }}
            />
            {consentLabel}
          </div>
        );
      }

      const checked = values[field.id] === "true";
      return (
        <label className="flex items-start gap-2.5 pt-0.5 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            required={field.required}
            onChange={(e) =>
              onChangeValue?.(field.id, e.target.checked ? "true" : "")
            }
            className="mt-0.5 w-4 h-4 rounded shrink-0"
            style={{ accentColor: theme.accentColor }}
          />
          {consentLabel}
        </label>
      );
    }

    if (field.type === "checkbox") {
      if (editable) {
        return (
          <div className="space-y-2 pt-0.5">
            {options.map((option) => (
              <div
                key={option.id}
                className="flex items-center gap-2.5 text-sm text-gray-700"
              >
                <span
                  className="w-4 h-4 rounded border shrink-0"
                  style={{ borderColor: theme.inputBorder }}
                />
                {option.label}
              </div>
            ))}
          </div>
        );
      }

      const selected = parseCheckboxValues(values[field.id]);
      return (
        <div className="space-y-2 pt-0.5">
          {options.map((option) => {
            const checked = selected.includes(option.label);
            return (
              <label
                key={option.id}
                className="flex items-center gap-2.5 text-sm text-gray-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  required={field.required && selected.length === 0}
                  onChange={() => {
                    const next = checked
                      ? selected.filter((v) => v !== option.label)
                      : [...selected, option.label];
                    onChangeValue?.(
                      field.id,
                      serializeCheckboxValues(next)
                    );
                  }}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: theme.accentColor }}
                />
                {option.label}
              </label>
            );
          })}
        </div>
      );
    }

    const inputType =
      field.type === "email" ||
      field.type === "tel" ||
      field.type === "url" ||
      field.type === "number" ||
      field.type === "date"
        ? field.type
        : "text";

    if (editable) {
      return (
        <PreviewShell theme={theme} field={field}>
          {field.placeholder || " "}
        </PreviewShell>
      );
    }

    return (
      <input
        required={field.required}
        type={inputType}
        placeholder={field.placeholder}
        value={values[field.id] || ""}
        onChange={(e) => onChangeValue?.(field.id, e.target.value)}
        className="w-full border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2"
        style={inputStyle}
      />
    );
  }

  const showDropHints = Boolean(draggingFieldType || draggingFieldId);

  return (
    <div
      className="w-full h-full min-h-full"
      style={{ backgroundColor: theme.pageBg }}
      onClick={
        editable
          ? (e) => {
              if (e.target === e.currentTarget) onSelect?.(null);
            }
          : undefined
      }
      onDragLeave={() => setDropIndex(null)}
    >
      <div
        className={`w-full max-w-[440px] mx-auto shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow ${selectionRing(
          isSelected({ type: "card" }),
          editable
        )}`}
        style={{
          backgroundColor: theme.cardBg,
          borderRadius: `${theme.cardRadius}px`,
          padding: `${theme.cardPadding}px`,
          borderWidth: theme.cardBorderWidth,
          borderStyle: theme.cardBorderWidth > 0 ? "solid" : "none",
          borderColor: theme.cardBorder,
        }}
        onClick={
          editable
            ? (e) => {
                e.stopPropagation();
                onSelect?.({ type: "card" });
              }
            : undefined
        }
      >
        <div
          className={`mb-6 rounded-xl transition-shadow ${selectionRing(
            isSelected({ type: "title" }),
            editable
          )}`}
          onClick={
            editable
              ? (e) => {
                  e.stopPropagation();
                  onSelect?.({ type: "title" });
                }
              : undefined
          }
        >
          <h1
            className="font-semibold tracking-tight"
            style={{
              color: theme.titleColor,
              fontSize: `${theme.titleSize}px`,
            }}
          >
            {name.trim() || "Contact form"}
          </h1>
        </div>

        {doneMessage ? (
          <div className="rounded-2xl bg-[#F3FAF6] border border-emerald-100 px-4 py-5">
            <p className="text-sm text-emerald-800 leading-relaxed">
              {doneMessage}
            </p>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="space-y-1"
            onClick={editable ? (e) => e.stopPropagation() : undefined}
          >
            {editable ? (
              <div
                className="py-1"
                onDragOver={(e) => allowDrop(e, 0)}
                onDrop={(e) => handleDropAt(e, 0)}
              >
                <DropLine active={showDropHints && dropIndex === 0} />
              </div>
            ) : null}

            {fields.map((field, index) => {
              const selected = isSelected({
                type: "field",
                fieldId: field.id,
              });
              return (
                <React.Fragment key={field.id}>
                  <div
                    className={`group relative rounded-xl transition-shadow ${
                      draggingFieldId === field.id ? "opacity-40" : ""
                    } ${selectionRing(selected, editable)}`}
                    onClick={
                      editable
                        ? (e) => {
                            e.stopPropagation();
                            onSelect?.({ type: "field", fieldId: field.id });
                          }
                        : undefined
                    }
                  >
                    {editable ? (
                      <div className="absolute right-1 top-1 z-10 flex items-center gap-0.5">
                        {onRemoveField ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveField(field.id);
                            }}
                            className={`p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-opacity ${
                              selected
                                ? "opacity-100"
                                : "opacity-0 group-hover:opacity-100"
                            }`}
                            aria-label="Delete field"
                            title="Delete field"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.setData(
                              LEAD_FIELD_REORDER_TYPE,
                              field.id
                            );
                            e.dataTransfer.effectAllowed = "move";
                            setDraggingFieldId(field.id);
                          }}
                          onDragEnd={() => {
                            setDraggingFieldId(null);
                            setDropIndex(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded-md text-gray-300 hover:text-gray-500 hover:bg-black/5 cursor-grab active:cursor-grabbing"
                          aria-label="Drag to reorder"
                        >
                          <GripVertical className="w-4 h-4" />
                        </button>
                      </div>
                    ) : null}
                    {field.type !== "terms" ? (
                      <span
                        className="block font-medium mb-1.5 pr-14"
                        style={fieldLabelStyle(theme, field)}
                      >
                        {field.label || "Field"}
                        {field.required ? (
                          <span className="text-red-500 ml-0.5">*</span>
                        ) : null}
                      </span>
                    ) : (
                      <div className="h-5" />
                    )}
                    {renderFieldControl(field)}
                  </div>

                  {editable ? (
                    <div
                      className="py-1"
                      onDragOver={(e) => allowDrop(e, index + 1)}
                      onDrop={(e) => handleDropAt(e, index + 1)}
                    >
                      <DropLine
                        active={showDropHints && dropIndex === index + 1}
                      />
                    </div>
                  ) : (
                    <div className="h-3" />
                  )}
                </React.Fragment>
              );
            })}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
              type={editable ? "button" : "submit"}
              disabled={!editable && submitting}
              className={`w-full text-sm font-semibold py-2.5 transition-shadow disabled:opacity-60 ${selectionRing(
                isSelected({ type: "button" }),
                editable
              )}`}
              style={{
                backgroundColor: theme.buttonBg,
                color: theme.buttonText,
                borderRadius: `${theme.buttonRadius}px`,
              }}
              onClick={
                editable
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelect?.({ type: "button" });
                    }
                  : undefined
              }
            >
              {submitting ? "Sending…" : theme.buttonLabel || "Send"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

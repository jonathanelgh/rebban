"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  LEAD_FORM_FIELD_TYPE_LABELS,
  LEAD_FORM_FIELD_TYPES,
  defaultOptionsForType,
  fieldNeedsOptions,
  newLeadFormOptionId,
  type LeadFormField,
  type LeadFormFieldType,
  type LeadFormSelection,
  type LeadFormTheme,
} from "@/lib/leads/forms";

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-900 mb-2">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={
            value.startsWith("#") && value.length >= 4
              ? value.slice(0, 7)
              : "#000000"
          }
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-gray-200 cursor-pointer bg-transparent p-0"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white uppercase font-mono"
        />
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  suffix = "px",
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-900 mb-2">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min ?? 0}
          max={max ?? 48}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1"
        />
        <span className="text-[12px] text-gray-500 w-12 text-right tabular-nums">
          {value}
          {suffix}
        </span>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-900 mb-2">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white"
      />
    </div>
  );
}

export function LeadFormStylePanel({
  selection,
  theme,
  fields,
  formName,
  onChangeTheme,
  onChangeField,
  onChangeFormName,
  onRemoveField,
}: {
  selection: LeadFormSelection;
  theme: Required<
    Pick<
      LeadFormTheme,
      | "pageBg"
      | "cardBg"
      | "cardBorder"
      | "cardBorderWidth"
      | "cardRadius"
      | "cardPadding"
      | "accentColor"
      | "titleColor"
      | "titleSize"
      | "subtitleColor"
      | "labelColor"
      | "labelSize"
      | "inputBg"
      | "inputBorder"
      | "inputText"
      | "inputRadius"
      | "buttonBg"
      | "buttonText"
      | "buttonRadius"
      | "buttonLabel"
    >
  >;
  fields: LeadFormField[];
  formName: string;
  onChangeTheme: (patch: Partial<LeadFormTheme>) => void;
  onChangeField: (fieldId: string, patch: Partial<LeadFormField>) => void;
  onChangeFormName: (name: string) => void;
  onRemoveField?: (fieldId: string) => void;
}) {
  const selectedField =
    selection.type === "field"
      ? fields.find((f) => f.id === selection.fieldId)
      : null;

  const title =
    selection.type === "card"
      ? "Form card"
      : selection.type === "title"
        ? "Title"
        : selection.type === "button"
          ? "Submit button"
          : selectedField?.label || "Field";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[13px] font-bold text-gray-900 mb-1">
          Editing: {title}
        </h3>
        <p className="text-[11px] text-gray-500">
          Changes apply live on the canvas.
        </p>
      </div>

      {selection.type === "card" ? (
        <div className="space-y-5">
          <ColorField
            label="Page background"
            value={theme.pageBg}
            onChange={(pageBg) => onChangeTheme({ pageBg })}
          />
          <ColorField
            label="Card background"
            value={theme.cardBg}
            onChange={(cardBg) => onChangeTheme({ cardBg })}
          />
          <ColorField
            label="Card border"
            value={theme.cardBorder}
            onChange={(cardBorder) => onChangeTheme({ cardBorder })}
          />
          <NumberField
            label="Border width"
            value={theme.cardBorderWidth}
            min={0}
            max={8}
            onChange={(cardBorderWidth) => onChangeTheme({ cardBorderWidth })}
          />
          <NumberField
            label="Corner radius"
            value={theme.cardRadius}
            min={0}
            max={40}
            onChange={(cardRadius) => onChangeTheme({ cardRadius })}
          />
          <NumberField
            label="Padding"
            value={theme.cardPadding}
            min={12}
            max={48}
            onChange={(cardPadding) => onChangeTheme({ cardPadding })}
          />
        </div>
      ) : null}

      {selection.type === "title" ? (
        <div className="space-y-5">
          <TextField
            label="Form title"
            value={formName}
            onChange={onChangeFormName}
          />
          <ColorField
            label="Title color"
            value={theme.titleColor}
            onChange={(titleColor) => onChangeTheme({ titleColor })}
          />
          <NumberField
            label="Title size"
            value={theme.titleSize}
            min={14}
            max={32}
            onChange={(titleSize) => onChangeTheme({ titleSize })}
          />
          <ColorField
            label="Subtitle color"
            value={theme.subtitleColor}
            onChange={(subtitleColor) => onChangeTheme({ subtitleColor })}
          />
        </div>
      ) : null}

      {selection.type === "button" ? (
        <div className="space-y-5">
          <TextField
            label="Button label"
            value={theme.buttonLabel}
            onChange={(buttonLabel) => onChangeTheme({ buttonLabel })}
          />
          <ColorField
            label="Background"
            value={theme.buttonBg}
            onChange={(buttonBg) => onChangeTheme({ buttonBg })}
          />
          <ColorField
            label="Text color"
            value={theme.buttonText}
            onChange={(buttonText) => onChangeTheme({ buttonText })}
          />
          <NumberField
            label="Corner radius"
            value={theme.buttonRadius}
            min={0}
            max={28}
            onChange={(buttonRadius) => onChangeTheme({ buttonRadius })}
          />
        </div>
      ) : null}

      {selection.type === "field" && selectedField ? (
        <div className="space-y-5">
          <TextField
            label={selectedField.type === "terms" ? "Consent text" : "Label"}
            value={selectedField.label}
            onChange={(label) => onChangeField(selectedField.id, { label })}
          />
          {selectedField.type !== "radio" &&
          selectedField.type !== "checkbox" &&
          selectedField.type !== "terms" ? (
            <TextField
              label="Placeholder"
              value={selectedField.placeholder || ""}
              onChange={(placeholder) =>
                onChangeField(selectedField.id, { placeholder })
              }
            />
          ) : null}
          {selectedField.type === "terms" ? (
            <>
              <TextField
                label="Terms URL"
                value={selectedField.termsUrl || ""}
                onChange={(termsUrl) =>
                  onChangeField(selectedField.id, { termsUrl })
                }
                placeholder="https://yoursite.com/terms"
              />
              <TextField
                label="Terms link label"
                value={selectedField.termsLabel || ""}
                onChange={(termsLabel) =>
                  onChangeField(selectedField.id, { termsLabel })
                }
                placeholder="Terms"
              />
              <TextField
                label="Privacy policy URL"
                value={
                  selectedField.privacyUrl || selectedField.linkUrl || ""
                }
                onChange={(privacyUrl) =>
                  onChangeField(selectedField.id, { privacyUrl })
                }
                placeholder="https://yoursite.com/privacy"
              />
              <TextField
                label="Privacy link label"
                value={
                  selectedField.privacyLabel ||
                  selectedField.linkLabel ||
                  ""
                }
                onChange={(privacyLabel) =>
                  onChangeField(selectedField.id, { privacyLabel })
                }
                placeholder="Privacy Policy"
              />
            </>
          ) : null}
          <div>
            <label className="block text-xs font-bold text-gray-900 mb-2">
              Type
            </label>
            <select
              value={selectedField.type}
              onChange={(e) => {
                const type = e.target.value as LeadFormFieldType;
                const patch: Partial<LeadFormField> = { type };
                if (fieldNeedsOptions(type)) {
                  if (
                    !selectedField.options ||
                    selectedField.options.length === 0
                  ) {
                    patch.options = defaultOptionsForType(type);
                  }
                  patch.termsUrl = undefined;
                  patch.termsLabel = undefined;
                  patch.privacyUrl = undefined;
                  patch.privacyLabel = undefined;
                  patch.linkUrl = undefined;
                  patch.linkLabel = undefined;
                } else if (type === "terms") {
                  patch.options = undefined;
                  patch.required = true;
                  patch.termsUrl = selectedField.termsUrl || "https://";
                  patch.termsLabel = selectedField.termsLabel || "Terms";
                  patch.privacyUrl =
                    selectedField.privacyUrl ||
                    selectedField.linkUrl ||
                    "https://";
                  patch.privacyLabel =
                    selectedField.privacyLabel ||
                    selectedField.linkLabel ||
                    "Privacy Policy";
                  if (
                    !selectedField.label ||
                    selectedField.label ===
                      LEAD_FORM_FIELD_TYPE_LABELS[selectedField.type]
                  ) {
                    patch.label = "I agree to the";
                  }
                } else {
                  patch.options = undefined;
                  patch.termsUrl = undefined;
                  patch.termsLabel = undefined;
                  patch.privacyUrl = undefined;
                  patch.privacyLabel = undefined;
                  patch.linkUrl = undefined;
                  patch.linkLabel = undefined;
                }
                onChangeField(selectedField.id, patch);
              }}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white"
            >
              {LEAD_FORM_FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {LEAD_FORM_FIELD_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
            <input
              type="checkbox"
              checked={selectedField.required}
              onChange={(e) =>
                onChangeField(selectedField.id, {
                  required: e.target.checked,
                })
              }
            />
            Required
          </label>

          {fieldNeedsOptions(selectedField.type) ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-gray-900">
                  Options
                </label>
                <button
                  type="button"
                  onClick={() =>
                    onChangeField(selectedField.id, {
                      options: [
                        ...(selectedField.options || []),
                        {
                          id: newLeadFormOptionId(),
                          label: `Option ${(selectedField.options?.length || 0) + 1}`,
                        },
                      ],
                    })
                  }
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
              <div className="space-y-1.5">
                {(selectedField.options || []).map((option, index) => (
                  <div key={option.id} className="flex items-center gap-1.5">
                    <input
                      value={option.label}
                      onChange={(e) => {
                        const options = (selectedField.options || []).map(
                          (opt) =>
                            opt.id === option.id
                              ? { ...opt, label: e.target.value }
                              : opt
                        );
                        onChangeField(selectedField.id, { options });
                      }}
                      className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white"
                      placeholder={`Option ${index + 1}`}
                    />
                    <button
                      type="button"
                      disabled={(selectedField.options || []).length <= 1}
                      onClick={() => {
                        const options = (selectedField.options || []).filter(
                          (opt) => opt.id !== option.id
                        );
                        onChangeField(selectedField.id, { options });
                      }}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
                      aria-label="Remove option"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <ColorField
            label="Label color"
            value={selectedField.style?.labelColor || theme.labelColor}
            onChange={(labelColor) =>
              onChangeField(selectedField.id, {
                style: { ...selectedField.style, labelColor },
              })
            }
          />
          <NumberField
            label="Label size"
            value={selectedField.style?.labelSize ?? theme.labelSize}
            min={11}
            max={18}
            onChange={(labelSize) =>
              onChangeField(selectedField.id, {
                style: { ...selectedField.style, labelSize },
              })
            }
          />
          {selectedField.type !== "terms" &&
          selectedField.type !== "radio" &&
          selectedField.type !== "checkbox" ? (
            <>
              <ColorField
                label="Input background"
                value={selectedField.style?.inputBg || theme.inputBg}
                onChange={(inputBg) =>
                  onChangeField(selectedField.id, {
                    style: { ...selectedField.style, inputBg },
                  })
                }
              />
              <ColorField
                label="Input border"
                value={selectedField.style?.inputBorder || theme.inputBorder}
                onChange={(inputBorder) =>
                  onChangeField(selectedField.id, {
                    style: { ...selectedField.style, inputBorder },
                  })
                }
              />
              <ColorField
                label="Input text"
                value={selectedField.style?.inputText || theme.inputText}
                onChange={(inputText) =>
                  onChangeField(selectedField.id, {
                    style: { ...selectedField.style, inputText },
                  })
                }
              />
              <NumberField
                label="Input radius"
                value={selectedField.style?.inputRadius ?? theme.inputRadius}
                min={0}
                max={24}
                onChange={(inputRadius) =>
                  onChangeField(selectedField.id, {
                    style: { ...selectedField.style, inputRadius },
                  })
                }
              />
            </>
          ) : null}

          <div className="pt-2 border-t border-line space-y-5">
            <label className="text-[11px] font-bold text-gray-800 uppercase tracking-wide">
              Defaults for all fields
            </label>
            <ColorField
              label="Default label color"
              value={theme.labelColor}
              onChange={(labelColor) => onChangeTheme({ labelColor })}
            />
            <ColorField
              label="Default input border"
              value={theme.inputBorder}
              onChange={(inputBorder) => onChangeTheme({ inputBorder })}
            />
          </div>

          {onRemoveField ? (
            <button
              type="button"
              onClick={() => onRemoveField(selectedField.id)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove field
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface FormFieldBase {
  modelKey: string;
  label: string;
  required?: boolean;
  /** Short helper text shown under the field. */
  hint?: string;
  inputmode?: "text" | "decimal" | "numeric" | "email" | "search" | "tel" | "url" | "none";
  enterkeyhint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
  autocomplete?:
    | "on"
    | "off"
    | "name"
    | "email"
    | "username"
    | "new-password"
    | "current-password"
    | "one-time-code";
  autocapitalize?: "off" | "none" | "sentences" | "words" | "characters";
  autocorrect?: "on" | "off";
  maxlength?: number;
}

interface InputField extends FormFieldBase {
  type: "input";
  inputType?: "text" | "email" | "number";
}

interface PasswordField extends FormFieldBase {
  type: "password";
}

interface SelectField extends FormFieldBase {
  type: "select";
  placeholder?: string;
  options: Array<{ value: string | number; label: string }>;
}

interface RadioField extends FormFieldBase {
  type: "radio";
  options: Array<{ value: string | boolean | number; label: string }>;
  defaultValue?: string | boolean | number;
}

interface SwitchField extends FormFieldBase {
  type: "switch";
}

interface DateField extends FormFieldBase {
  type: "date";
  defaultValue?: string;
  /** "date" picks a calendar day (value is local midnight); the default also picks a time. */
  mode?: "date" | "datetime";
}

interface UploadField extends FormFieldBase {
  type: "file";
}

type FormField =
  InputField | PasswordField | SelectField | RadioField | SwitchField | DateField | UploadField;

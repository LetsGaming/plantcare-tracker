interface FormFieldBase {
  modelKey: string;
  label: string;
  required?: boolean;
}

interface InputField extends FormFieldBase {
  type: "input";
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
}

interface UploadField extends FormFieldBase {
  type: "file";
}

type FormField =
  | InputField
  | PasswordField
  | SelectField
  | RadioField
  | SwitchField
  | DateField
  | UploadField;

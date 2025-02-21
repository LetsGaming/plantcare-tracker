interface FormFieldBase {
    modelKey: string;
    label: string;
  }
  
  interface InputField extends FormFieldBase {
    type: "input";
    required?: boolean;
  }
  
  interface SelectField extends FormFieldBase {
    type: "select";
    placeholder?: string;
    options: Array<{ id: string | number; name: string }>;
  }
  
  interface RadioField extends FormFieldBase {
    type: "radio";
    options: Array<{ value: string | boolean | number; label: string }>;
  }
  
  interface SwitchField extends FormFieldBase {
    type: "switch";
  }

  interface UploadField extends FormFieldBase {
    type: "file";
  }

  type FormField = InputField | SelectField | RadioField | SwitchField | UploadField;
  
import type {
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type InvalidState = {
  invalid?: boolean;
};

export function Input({
  className,
  invalid,
  "aria-invalid": ariaInvalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & InvalidState) {
  return (
    <input
      aria-invalid={invalid || ariaInvalid || undefined}
      className={classNames("ui-input", className)}
      {...props}
    />
  );
}

export function Textarea({
  className,
  invalid,
  "aria-invalid": ariaInvalid,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & InvalidState) {
  return (
    <textarea
      aria-invalid={invalid || ariaInvalid || undefined}
      className={classNames("ui-input", "ui-textarea", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  invalid,
  "aria-invalid": ariaInvalid,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & InvalidState) {
  return (
    <select
      aria-invalid={invalid || ariaInvalid || undefined}
      className={classNames("ui-select", className)}
      {...props}
    />
  );
}

export function Field({
  className,
  invalid,
  ...props
}: HTMLAttributes<HTMLDivElement> & InvalidState) {
  return (
    <div
      className={classNames("ui-field", className)}
      data-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function FieldLabel({
  children,
  className,
  requiredIndicator = false,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { requiredIndicator?: boolean }) {
  return (
    <label className={classNames("ui-field__label", className)} {...props}>
      {children}
      {requiredIndicator ? (
        <span className="ui-field__required" aria-hidden="true">
          {" "}*
        </span>
      ) : null}
    </label>
  );
}

export function FieldDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={classNames("ui-field__description", className)} {...props} />;
}

export function FieldError({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={classNames("ui-field__error", className)}
      role="alert"
      {...props}
    />
  );
}

type ChoiceProps = Omit<InputHTMLAttributes<HTMLInputElement>, "children" | "type"> & {
  label: ReactNode;
  description?: ReactNode;
  wrapperClassName?: string;
};

function Choice({
  label,
  description,
  wrapperClassName,
  className,
  type,
  ...props
}: ChoiceProps & { type: "checkbox" | "radio" }) {
  return (
    <label className={classNames("ui-choice", wrapperClassName)}>
      <input className={className} type={type} {...props} />
      <span className="ui-choice__content">
        <span className="ui-choice__label">{label}</span>
        {description ? <span className="ui-choice__description">{description}</span> : null}
      </span>
    </label>
  );
}

export function Checkbox(props: ChoiceProps) {
  return <Choice type="checkbox" {...props} />;
}

export function Radio(props: ChoiceProps) {
  return <Choice type="radio" {...props} />;
}

export function Switch({
  label,
  description,
  wrapperClassName,
  className,
  ...props
}: ChoiceProps) {
  return (
    <label className={classNames("ui-switch", wrapperClassName)}>
      <span className="ui-switch__control">
        <input
          className={classNames("ui-switch__input", className)}
          {...props}
          role="switch"
          type="checkbox"
        />
        <span className="ui-switch__track" aria-hidden="true" />
      </span>
      <span className="ui-switch__content">
        <span className="ui-switch__label">{label}</span>
        {description ? <span className="ui-switch__description">{description}</span> : null}
      </span>
    </label>
  );
}

import { useMotionValue } from "framer-motion";
import type {
  FieldPathByValue,
  FieldPathValue,
  FieldValues,
  UseFormSetValue,
} from "react-hook-form";

export function useMotionValueFormState<
  TFieldValues extends FieldValues,
  TPath extends FieldPathByValue<TFieldValues, number>,
>(
  initial: FieldPathValue<TFieldValues, TPath>,
  setValue: UseFormSetValue<TFieldValues>,
  path: TPath
) {
  const motionValue =
    useMotionValue<FieldPathValue<TFieldValues, TPath>>(initial);
  motionValue.on("change", (value) => setValue(path, value));

  return motionValue;
}

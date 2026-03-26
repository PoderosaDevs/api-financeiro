import { parseISO, startOfMonth, endOfMonth } from "date-fns";

export function getIntervaloDatas(dataInicio?: string, dataFim?: string) {
  return {
    inicio: dataInicio ? parseISO(dataInicio) : startOfMonth(new Date()),
    fim: dataFim ? parseISO(dataFim) : endOfMonth(new Date()),
  };
}

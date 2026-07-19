export function redactNarrative(message: string): string {
  const labelledIdentifiers =
    /((?:(?:booking|reservation|ticket|membership)\s*(?:reference|number|no\.?|id|code)\b|预订\s*(?:编号|号码|号)|票号|机票\s*(?:编号|号码|号)|会员\s*(?:编号|号码|号)|常旅客\s*(?:编号|号码|号)|预约\s*(?:编号|号码|号)|订单\s*(?:编号|号码|号)))(\s*(?::|：|#|是|为)?\s*)([a-z0-9][a-z0-9_/-]{3,})/giu;
  const punctuationLabelledIdentifiers =
    /((?:booking|reservation|ticket|membership))(\s*(?::|#)\s*)((?=[a-z0-9_/-]*(?:\d|[_/-]))[a-z0-9][a-z0-9_/-]{3,})/giu;
  const labelledPayments =
    /((?:payment\s*card|credit\s*card|debit\s*card|card|银行卡|支付卡)\s*(?:number|no\.?|编号|号码|号)?)(\s*(?::|：|#)?\s*)((?:\d[ -]?){11,18}\d)/giu;
  const emails = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/giu;
  const cardLikePayments = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;
  const labelledPhones =
    /((?:phone|telephone|tel|mobile|contact|电话|手机号|联系电话))(\s*(?::|：|#)?\s*)(\+?(?:\d[\s().-]?){7,14}\d)/giu;
  const internationalPhones = /\+\d(?:[\s().-]*\d){7,14}/g;
  const parenthesizedPhones = /(?:\+?1[\s.-]?)?\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}/g;
  const separatedPhones = /(?<!\d)\d{3}[-.\s]\d{3}[-.\s]\d{4}(?!\d)/g;
  const chineseMobilePhones = /(?<!\d)1[3-9]\d{9}(?!\d)/g;

  return message
    .replace(labelledIdentifiers, "$1$2[REDACTED_IDENTIFIER]")
    .replace(punctuationLabelledIdentifiers, "$1$2[REDACTED_IDENTIFIER]")
    .replace(labelledPayments, "$1$2[REDACTED_PAYMENT]")
    .replace(emails, "[REDACTED_EMAIL]")
    .replace(labelledPhones, "$1$2[REDACTED_PHONE]")
    .replace(internationalPhones, "[REDACTED_PHONE]")
    .replace(parenthesizedPhones, "[REDACTED_PHONE]")
    .replace(separatedPhones, "[REDACTED_PHONE]")
    .replace(chineseMobilePhones, "[REDACTED_PHONE]")
    .replace(cardLikePayments, "[REDACTED_PAYMENT]");
}

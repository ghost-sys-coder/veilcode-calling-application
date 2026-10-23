import type { DialingCountry } from "@/lib/calling-countries";

export interface ContactInput {
  name:string; company:string; phone:string; country:DialingCountry; notes:string;
}
export interface Contact extends ContactInput { id:string; createdAt:string; updatedAt:string }
export interface ContactPage { items:Contact[]; nextCursor:string | null }

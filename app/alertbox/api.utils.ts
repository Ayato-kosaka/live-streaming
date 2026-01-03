// API utility functions for GAS and Cloud Functions

import { GASApiResponse } from "./types";

/**
 * Get data from a GAS table
 * @param table Table name (e.g., "Viewers", "Goals", "SuperChats")
 * @returns Response data
 */
export async function getTable<T>(table: string): Promise<GASApiResponse<T>> {
  const url = `${process.env.EXPO_PUBLIC_GAS_API_URL}?table=${table}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${table}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get a specific record by ID from a GAS table
 * @param table Table name
 * @param id Record ID
 * @returns Response data
 */
export async function getById<T>(
  table: string,
  id: string
): Promise<GASApiResponse<T>> {
  const url = `${process.env.EXPO_PUBLIC_GAS_API_URL}?table=${table}&id=${id}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${table} with id ${id}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Insert a record into a GAS table
 * @param table Table name
 * @param record Record to insert
 * @returns Response data
 */
export async function insert<T>(
  table: string,
  record: T
): Promise<GASApiResponse<unknown>> {
  const url = `${process.env.EXPO_PUBLIC_GAS_API_URL}?table=${table}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ record }),
  });

  if (!response.ok) {
    throw new Error(`Failed to insert into ${table}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get doneruAmount from Cloud Functions
 * @param key Donery goal key
 * @returns Amount as a number
 */
export async function getDoneruAmount(key: string): Promise<number> {
  const url = `https://doneruamount-3phus6cpxa-uc.a.run.app/doneruAmount?key=${key}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch doneruAmount: ${response.statusText}`);
  }

  const data = await response.json();
  const amount = Number(data.amount);

  if (isNaN(amount)) {
    throw new Error(`Invalid doneruAmount response: ${data}`);
  }

  return amount;
}

/**
 * Get doneruToken from Cloud Functions
 * @param key Donery alertbox key
 * @returns Token data
 */
export async function getDoneruToken(key: string): Promise<{
  youtube: {
    at: string;
    channel: string;
    exp: number;
  }
}> {
  const url = `https://donerutoken-3phus6cpxa-uc.a.run.app/doneruToken?type=alertbox&key=${key}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch doneruToken: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}
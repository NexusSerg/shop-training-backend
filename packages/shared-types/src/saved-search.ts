// Saved search types

export interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  urlState: string;
  searchState: import('./search.js').SearchState;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSavedSearchRequest {
  name: string;
  urlState: string;
  searchState: import('./search.js').SearchState;
}

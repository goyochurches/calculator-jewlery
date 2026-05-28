import { api } from '@/api/apiClient'

export interface GoogleReview {
  authorName: string
  profilePhotoUrl: string | null
  rating: number | null
  relativeTime: string | null
  text: string | null
}

export interface GoogleReviews {
  /** False when no Place ID / API key is configured — show a setup hint. */
  configured: boolean
  /** Average star rating (e.g. 4.7), or null when unrated. */
  rating: number | null
  /** Total number of ratings behind the average. */
  total: number | null
  /** Up to ~5 of the most relevant reviews (Places API limit). */
  reviews: GoogleReview[]
}

export const reviewsService = {
  async get(): Promise<GoogleReviews> {
    return api.get<GoogleReviews>('/api/reviews')
  },
}

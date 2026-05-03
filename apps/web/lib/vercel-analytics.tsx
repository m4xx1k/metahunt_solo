"use client"

import { Analytics } from "@vercel/analytics/next"
import { PropsWithChildren } from 'react'
import { SpeedInsights } from "@vercel/speed-insights/next"

export function VercelAnalytics({children}: PropsWithChildren) {
  return <>
    {children}
    <Analytics />
		<SpeedInsights />
  </>
}
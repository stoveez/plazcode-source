--!strict
-- Server-side fixed-window request budget for one allowlisted action.
-- Use player UserId as the key and remove it on PlayerRemoving. Inject a clock
-- to exercise reset and burst behavior outside Studio.
type Bucket = { startedAt: number, count: number }

export type Budget = {
	allow: (key: number) -> boolean,
	remove: (key: number) -> (),
}

local FixedWindowBudget = {}

function FixedWindowBudget.new(maxRequests: number, window: number, clock: (() -> number)?): Budget
	assert(maxRequests > 0 and maxRequests < math.huge and maxRequests % 1 == 0, "expected a positive integer quota")
	assert(window > 0 and window < math.huge, "expected a finite positive window")
	local now = clock or os.clock
	local buckets: {[number]: Bucket} = {}

	local function allow(key: number): boolean
		local time = now()
		local bucket = buckets[key]
		if not bucket or time - bucket.startedAt >= window then
			buckets[key] = { startedAt = time, count = 1 }
			return true
		end
		if bucket.count >= maxRequests then
			return false
		end
		bucket.count += 1
		return true
	end

	local function remove(key: number)
		buckets[key] = nil
	end

	return { allow = allow, remove = remove }
end

return FixedWindowBudget

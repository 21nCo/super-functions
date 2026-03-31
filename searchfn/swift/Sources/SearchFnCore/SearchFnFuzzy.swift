import Foundation

public func searchFnLevenshteinDistance(_ lhs: String, _ rhs: String) -> Int {
    if lhs == rhs {
        return 0
    }

    if lhs.isEmpty {
        return rhs.count
    }

    if rhs.isEmpty {
        return lhs.count
    }

    var left = Array(lhs)
    var right = Array(rhs)

    if left.count < right.count {
        swap(&left, &right)
    }

    var previous = Array(0...right.count)
    var current = Array(repeating: 0, count: right.count + 1)

    for leftIndex in 1...left.count {
        current[0] = leftIndex

        for rightIndex in 1...right.count {
            if left[leftIndex - 1] == right[rightIndex - 1] {
                current[rightIndex] = previous[rightIndex - 1]
            } else {
                current[rightIndex] = min(
                    previous[rightIndex - 1] + 1,
                    current[rightIndex - 1] + 1,
                    previous[rightIndex] + 1
                )
            }
        }

        swap(&previous, &current)
    }

    return previous[right.count]
}

public func searchFnFuzzyExpand(
    term: String,
    maxDistance: Int,
    vocabulary: Set<String>
) -> [String] {
    let cappedDistance = min(max(maxDistance, 1), 3)
    let normalizedTerm = term.lowercased()

    return vocabulary
        .filter { candidate in
            let normalizedCandidate = candidate.lowercased()
            let lengthDifference = abs(normalizedCandidate.count - normalizedTerm.count)
            guard lengthDifference <= cappedDistance else {
                return false
            }
            return searchFnLevenshteinDistance(normalizedTerm, normalizedCandidate) <= cappedDistance
        }
        .sorted()
}

import { describe as describeSuite, expect, it } from 'vitest'

import {
  describe as describePlan,
  initialPlan,
  isChanged,
  keptPages,
  move,
  moveByKey,
  remove,
  restore,
  rotate,
  rotateAll,
  toRequest,
  toggleRemoved,
  type PlanEntry,
} from '@/lib/page-plan'

function numbers(plan: PlanEntry[]): number[] {
  return plan.map((entry) => entry.number)
}

describeSuite('page plan', () => {
  it('starts as the document is', () => {
    const plan = initialPlan(3)

    expect(numbers(plan)).toEqual([1, 2, 3])
    expect(plan.every((entry) => entry.rotation === 0 && !entry.removed)).toBe(true)
    expect(isChanged(plan)).toBe(false)
  })

  it('gives every page a key that survives editing', () => {
    // The keys are React keys and drag ids: if they shifted when a page moved,
    // the wrong thumbnail would animate and dragging would jump.
    const plan = initialPlan(3)
    const moved = move(plan, 0, 2)

    expect(moved.map((entry) => entry.key)).toEqual(['page-2', 'page-3', 'page-1'])
  })

  describeSuite('rotating', () => {
    it('turns one page a quarter turn', () => {
      const plan = rotate(initialPlan(2), 'page-1', 90)

      expect(plan[0].rotation).toBe(90)
      expect(plan[1].rotation).toBe(0)
    })

    it('accumulates turns rather than replacing them', () => {
      let plan = initialPlan(1)
      plan = rotate(plan, 'page-1', 90)
      plan = rotate(plan, 'page-1', 90)

      expect(plan[0].rotation).toBe(180)
    })

    it('comes back to zero after four turns', () => {
      let plan = initialPlan(1)
      for (let turn = 0; turn < 4; turn += 1) plan = rotate(plan, 'page-1', 90)

      expect(plan[0].rotation).toBe(0)
      expect(isChanged(plan)).toBe(false)
    })

    it('turns the other way without going negative', () => {
      // A -90 stored as -90 would be sent to an API that only accepts 0-270.
      const plan = rotate(initialPlan(1), 'page-1', -90)

      expect(plan[0].rotation).toBe(270)
    })

    it('turns every page at once', () => {
      const plan = rotateAll(initialPlan(3), 90)

      expect(plan.map((entry) => entry.rotation)).toEqual([90, 90, 90])
    })

    it('leaves removed pages out of a turn-everything', () => {
      const plan = rotateAll(remove(initialPlan(2), 'page-1'), 90)

      expect(plan[0].rotation).toBe(0)
      expect(plan[1].rotation).toBe(90)
    })
  })

  describeSuite('removing', () => {
    it('marks a page rather than dropping it', () => {
      // Still present, so it can be put back and so the pages either side do
      // not renumber under the user's cursor.
      const plan = remove(initialPlan(3), 'page-2')

      expect(plan).toHaveLength(3)
      expect(numbers(keptPages(plan))).toEqual([1, 3])
    })

    it('puts a page back', () => {
      const plan = restore(remove(initialPlan(2), 'page-1'), 'page-1')

      expect(keptPages(plan)).toHaveLength(2)
      expect(isChanged(plan)).toBe(false)
    })

    it('toggles', () => {
      const once = toggleRemoved(initialPlan(2), 'page-1')
      const twice = toggleRemoved(once, 'page-1')

      expect(once[0].removed).toBe(true)
      expect(twice[0].removed).toBe(false)
    })
  })

  describeSuite('moving', () => {
    it('moves a page to a new position', () => {
      expect(numbers(move(initialPlan(4), 0, 2))).toEqual([2, 3, 1, 4])
    })

    it('moves backwards too', () => {
      expect(numbers(move(initialPlan(4), 3, 0))).toEqual([4, 1, 2, 3])
    })

    it('ignores a target off either end', () => {
      const plan = initialPlan(3)

      expect(numbers(move(plan, 0, -1))).toEqual([1, 2, 3])
      expect(numbers(move(plan, 0, 3))).toEqual([1, 2, 3])
    })

    it('ignores a move to where the page already is', () => {
      const plan = initialPlan(3)

      expect(move(plan, 1, 1)).toBe(plan)
    })

    it('moves by key, which is what a drag reports', () => {
      expect(numbers(moveByKey(initialPlan(3), 'page-3', 0))).toEqual([3, 1, 2])
    })
  })

  describeSuite('what gets sent', () => {
    it('sends kept pages in their order, with rotations', () => {
      let plan = initialPlan(4)
      plan = remove(plan, 'page-2')
      plan = rotate(plan, 'page-4', 90)
      plan = moveByKey(plan, 'page-4', 0)

      expect(toRequest(plan)).toEqual([
        { number: 4, rotation: 90 },
        { number: 1, rotation: 0 },
        { number: 3, rotation: 0 },
      ])
    })

    it('sends nothing when every page is removed', () => {
      let plan = initialPlan(2)
      plan = remove(plan, 'page-1')
      plan = remove(plan, 'page-2')

      expect(toRequest(plan)).toEqual([])
    })
  })

  describeSuite('knowing there is something to save', () => {
    it('is unchanged until something happens', () => {
      expect(isChanged(initialPlan(5))).toBe(false)
    })

    it('notices a removal, a rotation and a move', () => {
      expect(isChanged(remove(initialPlan(2), 'page-1'))).toBe(true)
      expect(isChanged(rotate(initialPlan(2), 'page-1', 90))).toBe(true)
      expect(isChanged(move(initialPlan(2), 0, 1))).toBe(true)
    })
  })

  describeSuite('describing the edit', () => {
    it('says so when nothing has changed', () => {
      expect(describePlan(initialPlan(4), 4)).toBe('4 pages, unchanged')
    })

    it('counts removals and turns', () => {
      let plan = remove(initialPlan(5), 'page-2')
      plan = rotate(plan, 'page-1', 90)

      expect(describePlan(plan, 5)).toBe('1 page removed, 1 page turned')
    })

    it('mentions reordering only when the order actually changed', () => {
      // Removing pages 2 and 3 leaves 1, 4, 5 - still climbing, so calling
      // that "reordered" would be wrong.
      let plan = remove(initialPlan(5), 'page-2')
      plan = remove(plan, 'page-3')

      expect(describePlan(plan, 5)).toBe('2 pages removed')
      expect(describePlan(move(initialPlan(3), 2, 0), 3)).toBe('reordered')
    })
  })
})

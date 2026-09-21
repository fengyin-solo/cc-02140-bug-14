import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { categories as initialCategories } from '@/data/mockData'
import { useBookStore } from '@/stores/book'

const STORAGE_KEY = 'library_categories'
const LOAD_DELAY = 400

// 规范化分类数据：
// - 保留既有分类的 id 与 code（编码一经生成不再变更）
// - bookCount 是易过期的快照字段，不作为数据存储，统一由实际图书归属实时计算
function normalizeCategory(category) {
  return {
    id: category.id,
    name: category.name,
    code: category.code,
    description: category.description ?? ''
  }
}

export const useCategoryStore = defineStore('category', () => {
  const categories = ref([])
  // idle / loading / success / error —— 空数据、加载中、加载失败需区分展示
  const status = ref('idle')
  const error = ref('')

  let loadPromise = null

  // 模拟异步数据加载（失败时保留现场，由页面触发重试）
  function loadFromStorage() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const stored = localStorage.getItem(STORAGE_KEY)
          if (stored) {
            const parsed = JSON.parse(stored)
            if (!Array.isArray(parsed)) throw new Error('分类数据格式错误')
            resolve(parsed.map(normalizeCategory))
          } else {
            resolve(initialCategories.map(normalizeCategory))
          }
        } catch (e) {
          reject(e)
        }
      }, LOAD_DELAY)
    })
  }

  async function fetchCategories(force = false) {
    if (!force && (status.value === 'loading' || status.value === 'success')) {
      return loadPromise
    }

    status.value = 'loading'
    error.value = ''

    loadPromise = loadFromStorage()
      .then(data => {
        categories.value = data
        status.value = 'success'
        return data
      })
      .catch(e => {
        // 加载失败不清空既有数据，页面可从错误态点击重试
        error.value = e?.message || '分类数据加载失败'
        status.value = 'error'
        console.error('Failed to load categories:', e)
        // 吞掉 rejection，由 status/error 驱动页面反馈；retry 时重新拉取
        return undefined
      })

    return loadPromise
  }

  // 首次进入即加载
  fetchCategories()

  // 仅在数据正常加载后持久化，避免失败重试期间用空数据覆盖本地记录
  watch(categories, (newCategories) => {
    if (status.value === 'success') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newCategories))
    }
  }, { deep: true })

  const totalCategories = computed(() => categories.value.length)

  function getCategoryById(id) {
    return categories.value.find(cat => cat.id === id)
  }

  // 实时图书归属统计：分类下实际归属的图书数量
  const bookStore = useBookStore()
  const bookCountMap = computed(() => {
    const map = {}
    for (const book of bookStore.books) {
      if (book.categoryId != null) {
        map[book.categoryId] = (map[book.categoryId] || 0) + 1
      }
    }
    return map
  })

  function getBookCount(categoryId) {
    return bookCountMap.value[categoryId] || 0
  }

  function isCategoryInUse(categoryId) {
    return getBookCount(categoryId) > 0
  }

  function addCategory(category) {
    const newId = categories.value.length > 0
      ? Math.max(...categories.value.map(c => c.id)) + 1
      : 1
    categories.value.push(normalizeCategory({ ...category, id: newId }))
    return newId
  }

  function updateCategory(id, data) {
    const index = categories.value.findIndex(cat => cat.id === id)
    if (index !== -1) {
      // 既有分类编码保持不变
      const { code, ...updatable } = data
      categories.value[index] = { ...categories.value[index], ...updatable, code: categories.value[index].code }
      return true
    }
    return false
  }

  // 删除分类：仅当分类存在、图书数据已就绪、且没有任何图书实际归属该分类时才允许删除。
  // 占用中的分类不删除，图书原始记录一律保留（不做级联删除/改派）。
  function deleteCategory(id) {
    const index = categories.value.findIndex(cat => cat.id === id)
    if (index === -1) {
      return { success: false, reason: 'not_found', message: '分类不存在或已被删除' }
    }
    if (bookStore.status !== 'success') {
      return { success: false, reason: 'data_unready', message: '图书数据未就绪，请稍后重试' }
    }
    const count = getBookCount(id)
    if (count > 0) {
      return { success: false, reason: 'in_use', count, message: `该分类下还有 ${count} 本图书，无法删除` }
    }

    categories.value.splice(index, 1)
    return { success: true }
  }

  return {
    categories,
    status,
    error,
    totalCategories,
    fetchCategories,
    getCategoryById,
    getBookCount,
    isCategoryInUse,
    addCategory,
    updateCategory,
    deleteCategory
  }
})

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { categories as initialCategories } from '@/data/mockData'
import { useBookStore } from '@/stores/book'

const STORAGE_KEY = 'library_categories'

// 解析本地缓存，非法数据视为加载失败，交给调用方走重试/兜底流程
function parseStoredCategories(stored) {
  const parsed = JSON.parse(stored)
  if (!Array.isArray(parsed)) {
    throw new Error('分类数据格式错误')
  }
  return parsed
}

export const useCategoryStore = defineStore('category', () => {
  const bookStore = useBookStore()

  const categories = ref([])
  const loading = ref(false)
  const error = ref(null)

  // 首次创建 store 时用同步数据兜底，避免页面首屏闪烁
  function seedCategories() {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        categories.value = parseStoredCategories(stored)
        return
      } catch (e) {
        console.error('Failed to parse stored categories:', e)
      }
    }
    categories.value = [...initialCategories]
  }
  seedCategories()

  // 页面加载/重试时调用：区分加载中、加载失败与正常数据
  async function loadCategories() {
    loading.value = true
    error.value = null
    try {
      // 模拟异步请求
      await new Promise(resolve => setTimeout(resolve, 300))

      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        categories.value = parseStoredCategories(stored)
      } else {
        categories.value = [...initialCategories]
      }
    } catch (e) {
      console.error('Failed to load categories:', e)
      error.value = e?.message || '分类数据加载失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  // 缓存损坏导致重试仍失败时，恢复为初始数据并清除坏缓存
  async function retryLoadCategories() {
    try {
      await loadCategories()
    } catch (e) {
      categories.value = [...initialCategories]
      error.value = null
      loading.value = false
    }
  }

  watch(categories, (newCategories) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newCategories))
  }, { deep: true })

  const totalCategories = computed(() => categories.value.length)

  // 统计分类下实际归属的图书数量（以图书记录为准，不依赖缓存的 bookCount）
  function getBookCountByCategory(id) {
    return bookStore.books.filter(book => book.categoryId === id).length
  }

  // 分类列表附带实时图书数量，供页面与统计卡片使用
  const categoriesWithStats = computed(() =>
    categories.value.map(cat => ({
      ...cat,
      bookCount: getBookCountByCategory(cat.id)
    }))
  )

  function getCategoryById(id) {
    return categories.value.find(cat => cat.id === id)
  }

  function addCategory(category) {
    const newId = categories.value.length > 0
      ? Math.max(...categories.value.map(c => c.id)) + 1
      : 1
    categories.value.push({ ...category, id: newId })
    return newId
  }

  function updateCategory(id, data) {
    const index = categories.value.findIndex(cat => cat.id === id)
    if (index === -1) return false

    // 既有分类编码保持不变，忽略外部传入的 code
    const { code, ...updatable } = data
    categories.value[index] = { ...categories.value[index], ...updatable }

    // 名称变更时同步归属图书上的分类名称，保证展示一致
    if (updatable.name) {
      bookStore.books.forEach(book => {
        if (book.categoryId === id && book.categoryName !== updatable.name) {
          book.categoryName = updatable.name
        }
      })
    }
    return true
  }

  // 删除分类：
  // 1. 分类必须存在
  // 2. 占用检查——没有任何图书归属该分类时才允许删除
  // 图书记录始终保留，不做级联删除
  function deleteCategory(id) {
    const category = getCategoryById(id)
    if (!category) {
      return { success: false, reason: 'not_found' }
    }

    const bookCount = getBookCountByCategory(id)
    if (bookCount > 0) {
      return { success: false, reason: 'occupied', bookCount }
    }

    const index = categories.value.findIndex(cat => cat.id === id)
    categories.value.splice(index, 1)
    return { success: true }
  }

  return {
    categories,
    categoriesWithStats,
    loading,
    error,
    totalCategories,
    getCategoryById,
    getBookCountByCategory,
    addCategory,
    updateCategory,
    deleteCategory,
    loadCategories,
    retryLoadCategories
  }
})
